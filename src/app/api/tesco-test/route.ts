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
   // Normalise possessives and common plural endings without corrupting words like hummus.
   const singular=(word:string)=>{
    const irregular:Record<string,string>={tomatoes:'tomato',potatoes:'potato',berries:'berry',cherries:'cherry',loaves:'loaf',leaves:'leaf'};
    if(irregular[word])return irregular[word];
    if(word.length>4&&word.endsWith('ies'))return word.slice(0,-3)+'y';
    if(word.length>4&&/(ches|shes|xes|zzes)$/.test(word))return word.slice(0,-2);
    if(word.length>3&&word.endsWith('s')&&!/(ss|us|is|ous)$/.test(word))return word.slice(0,-1);
    return word;
   };
   const tokens=(value:string)=>value.toLowerCase().replace(/[’‘]/g,"'").replace(/([a-z])'s\b/g,'$1s').replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean);
   const canonical=(word:string)=>singular(word);
   const synonyms:Record<string,string[]>={oat:['porridge'],porridge:['oat'],courgette:['zucchini'],zucchini:['courgette'],coriander:['cilantro'],cilantro:['coriander']};
   const score=(query:string,title:string)=>{
    const q=tokens(query).map(canonical).filter(w=>w.length>1&&!['of','the','for','and','with','from','a','an'].includes(w));
    const t=tokens(title).map(canonical);
    if(!q.length)return 0;
    // Avoid confusing plain milk with plant drinks, flavoured milk or milk powder.
    if(q.length===1&&q[0]==='milk'&&['oat','almond','soya','soy','coconut','rice','goat','chocolate','strawberry','shake','powder','condensed','evaporated'].some(w=>t.includes(w)))return 0;
    // Porridge can match porridge oats, but never oat milk or other oat drinks.
    if(q.includes('porridge')&&['milk','drink','barista','beverage','yoghurt','yogurt','biscuit','bar'].some(w=>t.includes(w)))return 0;
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
    let searchResults:Awaited<ReturnType<typeof client.search>>['results']=[];
    let searchFailed=false;
    try{
     const variants=[name];
     const normalized=tokens(name).map(canonical).join(' ');
     if(normalized&&normalized!==name.toLowerCase())variants.push(normalized);
     const withoutPossessive=name.replace(/[’']/g,'');
     if(withoutPossessive!==name&&!variants.includes(withoutPossessive))variants.push(withoutPossessive);
     const all=await Promise.allSettled(variants.map(query=>client.search(query,{limit:20})));
     const unique=new Map<string,(typeof searchResults)[number]>();
     for(const result of all)if(result.status==='fulfilled')for(const item of result.value.results)unique.set(item.sku,item);
     if(!all.some(result=>result.status==='fulfilled'))throw Error('All Tesco catalogue searches failed');
     searchResults=[...unique.values()];
    }catch(searchError){
     searchFailed=true;
     const errorName=searchError instanceof Error?searchError.name:typeof searchError;
     console.error('[tesco-matches]',traceId,'catalogue-search-failed',{itemIndex:matches.length,errorName});
    }
    console.info('[tesco-matches]',traceId,'search-result',{itemIndex:matches.length,count:searchResults.length,searchFailed});
    const suitable=searchResults.filter(x=>score(name,x.title)>=0.75);
    const favourites=fav.results.filter(x=>score(name,x.title)>=0.75).sort((a,b)=>score(name,b.title)-score(name,a.title));
    const lastItems=[...fav.results,...searchResults].filter(x=>lastIds.has(x.sku)&&score(name,x.title)>=0.75).sort((a,b)=>score(name,b.title)-score(name,a.title));
    const cheapest=[...suitable].filter(x=>typeof x.price?.actual==='number').sort((a,b)=>(a.price?.actual??Infinity)-(b.price?.actual??Infinity));
    console.info('[tesco-matches]',traceId,'ranked',{itemIndex:matches.length,catalogueCandidates:searchResults.length,suitable:suitable.length,favourites:favourites.length,lastOrder:lastItems.length});
    matches.push({favourite:favourites[0]?product(favourites[0]):null,lastOrder:lastItems[0]?product(lastItems[0]):null,cheapest:cheapest[0]?product(cheapest[0]):null,searchFailed});
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
  if(action==='basket'){
   const basket=await client.basket.get();
   const skus=[...new Set(basket.items.map(x=>x.sku).filter((sku):sku is string=>typeof sku==='string'&&sku.length>0))];
   const details=new Map<string,{title:string;price:number|null;imageUrl:string|null}>();
   for(let i=0;i<skus.length;i+=6){
    const results=await Promise.allSettled(skus.slice(i,i+6).map(sku=>client.getProduct(sku)));
    results.forEach((result,j)=>{
     if(result.status==='fulfilled'){
      const product=result.value;
      details.set(skus[i+j],{title:product.title,price:typeof product.price?.actual==='number'?product.price.actual:null,imageUrl:product.imageUrl||null});
     }
    });
   }
   return reply({items:basket.items.map(x=>({sku:x.sku,quantity:x.quantity,cost:x.cost,product:(x.sku?details.get(x.sku):null)||null})),guidePrice:basket.guidePrice});
  }
  if(action==='product'){const sku=req.nextUrl.searchParams.get('sku')||'';if(!/^\d{6,15}$/.test(sku))return reply({error:'Invalid SKU'},400);const x=await client.getProduct(sku);return reply({product:{sku:x.sku,title:x.title,price:x.price,imageUrl:x.imageUrl}})}
  return reply({error:'Unknown test operation'},400);
 }catch(e){return failure(e)}
}
export async function POST(req:NextRequest){
 if(!await authorize(req))return reply({error:'Sign in to the calendar first.'},401);
  if((req.nextUrl.searchParams.get('action'))==='sync-order'){
   const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
   const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
   if(!url||!key||!token)return reply({error:'Sign in required'},401);
   const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+token}}});
   const {data:{user},error:authError}=await db.auth.getUser(token);
   if(authError||!user)return reply({error:'Sign in again'},401);
   try{
    const client=await tesco();
    const localDate=(value:Date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
    const today=localDate(new Date());
    const endDate=(days:number)=>{const d=new Date();d.setUTCDate(d.getUTCDate()+days);return localDate(d)};
    // Tesco exposes booked delivery slots separately from completed orders.
    // A Booked status alone does not prove ownership: ask the user to confirm before writing.
    const ranges=[{start:today,end:endDate(6)},{start:endDate(7),end:endDate(13)}];
    const slotResults=await Promise.allSettled(ranges.map(range=>client.slots.list(range)));
    const slots=slotResults.flatMap(x=>x.status==='fulfilled'?x.value:[])
      .filter(x=>x.status.toLowerCase()==='booked'&&x.id&&Number.isFinite(Date.parse(x.start))&&Number.isFinite(Date.parse(x.end))&&localDate(new Date(x.start))>=today)
      .sort((x,y)=>Date.parse(x.start)-Date.parse(y.start));
    const selectedSlotId=(await req.json().catch(()=>({})))?.slotId as string|undefined;
    if(slots.length&&!selectedSlotId)return reply({found:false,requiresConfirmation:true,slots:slots.map(x=>({id:x.id,start:x.start,end:x.end})),message:'Tesco reports a booked delivery slot. Confirm the correct reservation to add it to your calendar.'});
    if(selectedSlotId){
     const slot=slots.find(x=>x.id===selectedSlotId);
     if(!slot)return reply({error:'Selected slot is no longer reported as booked. Refresh Find slot.'},409);
     const stableId='reserved-slot:'+slot.id;
     const existing=await db.from('family_events').select('id').eq('tesco_order_id',stableId).maybeSingle();
     if(existing.error)throw existing.error;
     const payload={title:'Tesco delivery (reserved)',event_date:localDate(new Date(slot.start)),start_at:new Date(slot.start).toISOString(),end_at:new Date(slot.end).toISOString(),important:false};
     const result=existing.data?await db.from('family_events').update(payload).eq('id',existing.data.id).select('id').single():await db.from('family_events').insert({...payload,tesco_order_id:stableId,created_by:user.id}).select('id').single();
     if(result.error)throw result.error;
     return reply({found:true,reserved:true,eventId:result.data.id,orderNo:'Reserved slot',start:slot.start,end:slot.end,created:!existing.data,message:existing.data?'Reserved Tesco slot updated in calendar.':'Reserved Tesco slot added to calendar.'});
    }
    const orders=await client.orders.list();
    const upcoming=orders.filter(o=>o.slot?.start&&o.slot?.end&&Number.isFinite(Date.parse(o.slot.start))&&Number.isFinite(Date.parse(o.slot.end))&&localDate(new Date(o.slot.start))>=today)
      .sort((x,y)=>Date.parse(x.slot!.start!)-Date.parse(y.slot!.start!));
    const order=upcoming[0];
    if(!order)return reply({found:false,message:'No booked delivery slot was returned for the next 14 days, and no upcoming confirmed order was found.'});
    if(!order.id)return reply({error:'Tesco order has no stable identifier; calendar event not created.'},422);
    const start=order.slot!.start!,end=order.slot!.end!;
    const existing=await db.from('family_events').select('id').eq('tesco_order_id',order.id).maybeSingle();
    if(existing.error)throw existing.error;
    const payload={title:'Tesco delivery',event_date:localDate(new Date(start)),start_at:new Date(start).toISOString(),end_at:new Date(end).toISOString(),important:false};
    const result=existing.data?await db.from('family_events').update(payload).eq('id',existing.data.id).select('id').single():await db.from('family_events').insert({...payload,tesco_order_id:order.id,created_by:user.id}).select('id').single();
    if(result.error)throw result.error;
    return reply({found:true,eventId:result.data.id,orderNo:order.orderNo,start,end,created:!existing.data,message:existing.data?'Tesco delivery updated in Family calendar.':'Tesco delivery added to Family calendar.'});
   }catch(e){if(e instanceof Error&&('code' in e))return reply({error:'Could not save Tesco delivery in Family calendar: '+e.message},500);return failure(e)}
  }
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
