import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {Basketeer,type Session} from 'basketeer';
import {SecretsManagerClient,GetSecretValueCommand} from '@aws-sdk/client-secrets-manager';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
function reply(body:object,status=200){return NextResponse.json(body,{status,headers})}
async function authorize(request:NextRequest){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
 if(!url||!key||!token)return false;
 const supabase=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error}=await supabase.auth.getUser(token);
 return !error&&!!user;
}
const secrets = new SecretsManagerClient({});
async function tesco(){
 let raw=process.env.TESCO_SESSION_B64;
 if(!raw){
  const secret=await secrets.send(new GetSecretValueCommand({SecretId:process.env.TESCO_SECRET_ID||'e-calendar/tesco-session'}));
  const value=secret.SecretString||(secret.SecretBinary?Buffer.from(secret.SecretBinary).toString('utf8'):null);
  if(!value)throw new Error('NOT_CONFIGURED');
  try{
   const session=JSON.parse(value) as Session;
   if(!session.accessToken||!session.customerUuid||!session.cookies)throw new Error('INVALID_SESSION');
   if(session.accessTokenExpiry&&session.accessTokenExpiry<Date.now()+30000)throw new Error('EXPIRED');
   return new Basketeer({session});
  }catch(e){if(e instanceof SyntaxError)throw new Error('INVALID_SESSION');throw e}
 }
 const session=JSON.parse(Buffer.from(raw,'base64').toString('utf8')) as Session;
 if(!session.accessToken||!session.customerUuid||!session.cookies)throw new Error('INVALID_SESSION');
 if(session.accessTokenExpiry&&session.accessTokenExpiry<Date.now()+30000)throw new Error('EXPIRED');
 return new Basketeer({session});
}
export async function GET(req:NextRequest){
 if(!await authorize(req))return reply({error:'Sign in to the calendar first.'},401);
 try{
  const client=await tesco();
  const action=req.nextUrl.searchParams.get('action');
  if(action==='matches'){
   const namesRaw=req.nextUrl.searchParams.get('names')||'[]';
   let names:unknown;
   try{names=JSON.parse(namesRaw)}catch{return reply({error:'Invalid grocery list'},400)}
   if(!Array.isArray(names)||names.length>30||names.some(x=>typeof x!=='string'||x.length<1||x.length>100))return reply({error:'Invalid grocery items'},400);
   const [fav,last]=await Promise.all([client.favourites({limit:100}),client.orders.lastFulfilled()]);
   // Compare whole words, never substrings: "oats" must not match "goats".
   const words=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean).map(w=>w.endsWith('s')&&w.length>3?w.slice(0,-1):w);
   const variants:Record<string,string[]>={milk:['milk'],oat:['oat','porridge'],egg:['egg'],bread:['bread'],butter:['butter']};
   const exclusions:Record<string,string[]>={milk:['chocolate','shake','oat','almond','soya','coconut','rice','goat','powder','condensed','evaporated'],oat:['goat','cheese','milk','drink','biscuit','bar']};
   const score=(query:string,title:string)=>{
    const q=words(query),t=words(title);
    if(!q.length)return 0;
    const hits=q.filter(w=>t.includes(w)||(variants[w]||[]).some(v=>t.includes(v))).length;
    if(hits!==q.length)return 0;
    if(q.length===1&&(exclusions[q[0]]||[]).some(w=>t.includes(w)))return 0;
    return hits/q.length;
   };
   type Candidate={sku:string;title:string;price?:{actual?:number|null}|null};
   const product=(p:Candidate)=>({sku:p.sku,title:p.title,price:p.price?.actual??null});
   const lastIds=new Set((last?.items||[]).map(x=>String(x.productId||'')).filter(Boolean));
   const matches=[];
   const orderProducts:Candidate[]=[];
   // Load historical SKUs once per request, not once per grocery item.
   for(const sku of [...lastIds].slice(0,12)){
    const known=fav.results.find(x=>x.sku===sku);
    if(known){orderProducts.push(known);continue}
    try{orderProducts.push(await client.getProduct(sku))}catch{/* unavailable historical SKU */}
   }
   for(const name of names as string[]){
    // Search more candidates, and fall back to a broader singular form.
    const query=words(name).join(' ')||name;
    const found=await client.search(name,{limit:30});
    const pool:Candidate[]=[...found.results];
    if(!pool.length||!pool.some(x=>score(name,x.title)>0)){
     const alternate=query==='milk'?'whole milk':query==='oat'?'porridge oats':query;
     if(alternate!==name){const retry=await client.search(alternate,{limit:30});pool.push(...retry.results)}
    }
    const unique=(xs:Candidate[])=>xs.filter((x,i,a)=>a.findIndex(y=>y.sku===x.sku)===i);
    const suitable=unique(pool.filter(x=>score(name,x.title)>0));
    const favourites=unique(fav.results.filter(x=>score(name,x.title)>0)).sort((a,b)=>score(name,b.title)-score(name,a.title));
    const lastItems=unique([...orderProducts,...pool.filter(x=>lastIds.has(x.sku))].filter(x=>score(name,x.title)>0));
    // Compare unit prices only when the same measurable pack unit is available.
    const pack=(title:string)=>{const m=title.toLowerCase().match(/(\d+(?:\.\d+)?)\s*(kg|g|litres?|l|ml)\b/);if(!m)return null;const n=Number(m[1]);const unit=m[2];return {value:n*(unit==='kg'||unit==='l'||unit.startsWith('litre')?1000:1),kind:unit==='kg'||unit==='g'?'weight':'volume'}};
    const priced=suitable.filter(x=>typeof x.price?.actual==='number'&&x.price.actual>0);
    const reference=pack(lastItems[0]?.title||favourites[0]?.title||'');
    const comparable=reference?priced.filter(x=>pack(x.title)?.kind===reference.kind):priced;
    const cheapest=[...(comparable.length?comparable:priced)].sort((a,b)=>{
     const pa=pack(a.title),pb=pack(b.title);
     if(pa&&pb&&pa.kind===pb.kind)return (a.price?.actual??Infinity)/pa.value-(b.price?.actual??Infinity)/pb.value;
     return (a.price?.actual??Infinity)-(b.price?.actual??Infinity);
    });
    matches.push({favourite:favourites[0]?product(favourites[0]):null,lastOrder:lastItems[0]?product(lastItems[0]):null,cheapest:cheapest[0]?product(cheapest[0]):null});
   }
   return reply({matches});
  }
  if(action==='favourites'){const data=await client.favourites({limit:30});return reply({items:data.results.map(x=>({sku:x.sku,title:x.title,price:x.price,imageUrl:x.imageUrl}))})}
  if(action==='basket'){const basket=await client.basket.get();return reply({items:basket.items.map(x=>({sku:x.sku,quantity:x.quantity,cost:x.cost})),guidePrice:basket.guidePrice})}
  if(action==='product'){const sku=req.nextUrl.searchParams.get('sku')||'';if(!/^\d{6,15}$/.test(sku))return reply({error:'Invalid SKU'},400);const x=await client.getProduct(sku);return reply({product:{sku:x.sku,title:x.title,price:x.price,imageUrl:x.imageUrl}})}
  return reply({error:'Unknown test operation'},400);
 }catch(e){return failure(e)}
}
export async function POST(req:NextRequest){
 if(!await authorize(req))return reply({error:'Sign in to the calendar first.'},401);
 try{
  const {sku,quantity,confirmed}=await req.json() as {sku?:string;quantity?:number;confirmed?:boolean};
  if(!confirmed||!sku||!/^\d{6,15}$/.test(sku)||quantity!==1)return reply({error:'Explicitly confirm a single SKU and quantity 1.'},400);
  const client=await tesco();
  const before=await client.basket.get();
  const existing=before.items.find(x=>x.sku===sku)?.quantity||0;
  const result=await client.basket.add(sku,1);
  const after=await client.basket.get();
  const actual=after.items.find(x=>x.sku===sku)?.quantity||0;
  return reply({success:actual===existing+1,sku,previousQuantity:existing,currentQuantity:actual,guidePrice:after.guidePrice,reportedQuantity:result.items.find(x=>x.sku===sku)?.quantity});
 }catch(e){return failure(e)}
}
function failure(e:unknown){
 const name=e instanceof Error?e.name:'Unknown';
 const msg=e instanceof Error?e.message:'';
 if(name==='ResourceNotFoundException')return reply({error:'Tesco secret not found. Check AWS region and secret name.'},503);
 if(name==='AccessDeniedException'||name==='UnrecognizedClientException'||name==='CredentialsProviderError')return reply({error:'Amplify server lacks permission to read the Tesco secret. Configure its IAM compute role.'},503);
 if(msg==='NOT_CONFIGURED')return reply({error:'Tesco session not configured in AWS Amplify.'},503);
 if(msg==='EXPIRED'||name==='AuthExpiredError')return reply({error:'Tesco session expired. Reconnect on your Mac and update the AWS session.'},401);
 if(msg==='INVALID_SESSION')return reply({error:'Tesco session configuration invalid.'},503);
 console.error('Tesco hosted test error',name);
 return reply({error:name==='ItemUnavailableError'?'Product unavailable for your Tesco basket':name==='LineRejectedError'?'Tesco rejected the basket update.':name==='RateLimitedError'?'Tesco rate limit reached.':'Tesco request failed ('+name+').'},502);
}
