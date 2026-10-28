import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {Basketeer,type Session} from 'basketeer';
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
function tesco(){
 const raw=process.env.TESCO_SESSION_B64;
 if(!raw)throw new Error('NOT_CONFIGURED');
 const session=JSON.parse(Buffer.from(raw,'base64').toString('utf8')) as Session;
 if(!session.accessToken||!session.customerUuid||!session.cookies)throw new Error('INVALID_SESSION');
 if(session.accessTokenExpiry&&session.accessTokenExpiry<Date.now()+30000)throw new Error('EXPIRED');
 return new Basketeer({session});
}
export async function GET(req:NextRequest){
 if(!await authorize(req))return reply({error:'Sign in to the calendar first.'},401);
 try{
  const client=tesco();
  const action=req.nextUrl.searchParams.get('action');
  if(action==='favourites'){const data=await client.favourites({limit:30});return reply({items:data.results.map(x=>({sku:x.sku,title:x.title,available:x.available,price:x.price,imageUrl:x.imageUrl}))})}
  if(action==='basket'){const basket=await client.basket.get();return reply({items:basket.items.map(x=>({sku:x.sku,quantity:x.quantity,available:x.available,cost:x.cost})),guidePrice:basket.guidePrice})}
  if(action==='product'){const sku=req.nextUrl.searchParams.get('sku')||'';if(!/^\d{6,15}$/.test(sku))return reply({error:'Invalid SKU'},400);const x=await client.getProduct(sku);return reply({product:{sku:x.sku,title:x.title,available:x.available,price:x.price,imageUrl:x.imageUrl}})}
  return reply({error:'Unknown test operation'},400);
 }catch(e){return failure(e)}
}
export async function POST(req:NextRequest){
 if(!await authorize(req))return reply({error:'Sign in to the calendar first.'},401);
 try{
  const {sku,quantity,confirmed}=await req.json() as {sku?:string;quantity?:number;confirmed?:boolean};
  if(!confirmed||!sku||!/^\d{6,15}$/.test(sku)||quantity!==1)return reply({error:'Explicitly confirm a single SKU and quantity 1.'},400);
  const client=tesco();
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
 if(msg==='NOT_CONFIGURED')return reply({error:'Tesco session not configured in AWS Amplify.'},503);
 if(msg==='EXPIRED'||name==='AuthExpiredError')return reply({error:'Tesco session expired. Reconnect on your Mac and update the AWS session.'},401);
 if(msg==='INVALID_SESSION')return reply({error:'Tesco session configuration invalid.'},503);
 console.error('Tesco hosted test error',name);
 return reply({error:name==='ItemUnavailableError'?'Product unavailable for your Tesco basket':name==='LineRejectedError'?'Tesco rejected the basket update.':name==='RateLimitedError'?'Tesco rate limit reached.':'Tesco request failed ('+name+').'},502);
}
