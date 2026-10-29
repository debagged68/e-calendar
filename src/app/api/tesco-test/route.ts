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
   const traceId=crypto.randomUUID().slice(0,8);
   let stage='favourites-and-last-order';
   const started=Date.now();
   console.info('[tesco-matches]',traceId,'start',{itemCount:names.length});
   try{
   const [fav,last]=await Promise.all([client.favourites({limit:100}),client.orders.lastFulfilled()]);
   console.info('[tesco-matches]',traceId,'sources',{favourites:fav.results.length,lastOrderItems:last?.items?.length??0,elapsedMs:Date.now()-started});
   // Pure local scoring: no changes to Tesco requests, limits or order lookups.
   const tokens=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean);
   const canonical=(word:string)=>({oats:'oat',eggs:'egg',tomatoes:'tomato',potatoes:'potato',bananas:'banana'} as Record<string,string>)[word]||word;
   const synonyms:Record<string,string[]>={oat:['porridge'],porridge:['oat'],courgette:['zucchini'],zucchini:['courgette'],coriander:['cilantro'],cilantro:['coriander']};
   const score=(query:string,title:string)=>{
    const q=tokens(query).map(canonical).filter(w=>w.length>1);
    const t=tokens(title).map(canonical);
    if(!q.length)return 0;
    // Avoid confusing plain milk with plant drinks, flavoured milk or milk powder.
    if(q.length===1&&q[0]==='milk'&&['oat','almond','soya','soy','coconut','rice','goat','chocolate','strawberry','shake','powder','condensed','evaporated'].some(w=>t.includes(w)))return 0;
    // Reject unrelated oat products when the request is simply for oats.
    if(q.length===1&&q[0]==='oat'&&['milk','drink','biscuit','bar','cheese','goat'].some(w=>t.includes(w)))return 0;
    const hits=q.filter(w=>t.includes(w)||(synonyms[w]||[]).some(v=>t.includes(v))).length;
    if(hits!==q.length)return 0;
    const exact=q.filter(w=>t.includes(w)).length;
    return 0.8+0.2*exact/q.length;
   };
   const product=(p:{sku:string;title:string;price?:{actual?:number|null}|null})=>({sku:p.sku,title:p.title,price:p.price?.actual??null});
   const lastIds=new Set((last?.items||[]).map(x=>x.productId).filter((x):x is string=>typeof x==='string'));
   const matches=[];
   for(const name of names){
    stage='catalogue-search';
    console.info('[tesco-matches]',traceId,'search',{itemIndex:matches.length,queryLength:name.length});
    const found=await client.search(name,{limit:20});
    console.info('[tesco-matches]',traceId,'search-result',{itemIndex:matches.length,count:found.results.length});
    const suitable=found.results.filter(x=>score(name,x.title)>=0.75);
    const favourites=fav.results.filter(x=>score(name,x.title)>=0.75).sort((a,b)=>score(name,b.title)-score(name,a.title));
    const lastItems=[...fav.results,...found.results].filter(x=>lastIds.has(x.sku)&&score(name,x.title)>=0.75).sort((a,b)=>score(name,b.title)-score(name,a.title));
    const cheapest=[...suitable].filter(x=>typeof x.price?.actual==='number').sort((a,b)=>(a.price?.actual??Infinity)-(b.price?.actual??Infinity));
    console.info('[tesco-matches]',traceId,'ranked',{itemIndex:matches.length,catalogueCandidates:found.results.length,suitable:suitable.length,favourites:favourites.length,lastOrder:lastItems.length});
    matches.push({favourite:favourites[0]?product(favourites[0]):null,lastOrder:lastItems[0]?product(lastItems[0]):null,cheapest:cheapest[0]?product(cheapest[0]):null});
   }
   console.info('[tesco-matches]',traceId,'complete',{itemCount:matches.length,elapsedMs:Date.now()-started});
   return reply({matches,traceId});
   }catch(e){
    const errorName=e instanceof Error?e.name:typeof e;
    console.error('[tesco-matches]',traceId,'failed',{stage,errorName,elapsedMs:Date.now()-started});
    return reply({error:'Tesco matching failed during '+stage+'. Reference '+traceId,traceId},502);
   }
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
