import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {SecretsManagerClient,GetSecretValueCommand} from '@aws-sdk/client-secrets-manager';
import {Basketeer,type Session} from 'basketeer';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const respond=(data:object,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(req:NextRequest){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
 if(!url||!key||!token)return respond({error:'Not authenticated'},401);
 const db=createClient(url,key,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
 const auth=await db.auth.getUser(token);if(auth.error||!auth.data.user)return respond({error:'Not authenticated'},401);
 let listId:string;try{({listId}=await req.json())}catch{return respond({error:'Invalid request'},400)}
 if(!/^[0-9a-f-]{36}$/i.test(listId||''))return respond({error:'Invalid list'},400);
 const list=await db.from('grocery_lists').select('id,event_id,status').eq('id',listId).single();
 if(list.error||!list.data||list.data.status!=='collecting')return respond({error:'Grocery list unavailable'},404);
 const rows=await db.from('grocery_items').select('id,quantity').eq('list_id',listId);
 if(rows.error)return respond({error:rows.error.message},500);
 const ids=(rows.data||[]).map(x=>x.id);
 if(!ids.length)return respond({error:'List empty'},400);
 const matches=await db.from('grocery_item_products').select('grocery_item_id,tesco_sku,basket_status').in('grocery_item_id',ids).eq('basket_status','selected');
 if(matches.error)return respond({error:matches.error.message},500);
 if(!matches.data?.length)return respond({error:'No selected products waiting to send'},400);
 let session:Session;
 try{
  const secret=await new SecretsManagerClient({region:process.env.AWS_REGION||'eu-north-1'}).send(new GetSecretValueCommand({SecretId:process.env.TESCO_SECRET_ID||'e-calendar/tesco-session'}));
  session=JSON.parse(secret.SecretString||'{}') as Session;
  if(!session.accessToken||!session.customerUuid||!session.cookies||!session.accessTokenExpiry||session.accessTokenExpiry<Date.now()+30000)throw Error('expired');
 }catch{return respond({error:'Tesco session expired or unavailable. Reconnect Tesco before committing.'},503)}
 const tesco=new Basketeer({session});
 let sent=0;
 for(const m of matches.data){
  const qty=rows.data?.find(x=>x.id===m.grocery_item_id)?.quantity||0;
  if(qty<1)continue;
  // Reserve before external side effect; a failed/ambiguous request is never automatically retried.
  const reserve=await db.from('grocery_item_products').update({basket_status:'sending'}).eq('grocery_item_id',m.grocery_item_id).eq('basket_status','selected').select('grocery_item_id');
  if(reserve.error||!reserve.data?.length)continue;
  try{
   for(let i=0;i<qty;i++)await tesco.basket.add(m.tesco_sku,1);
   const done=await db.from('grocery_item_products').update({basket_status:'sent',basket_sent_at:new Date().toISOString()}).eq('grocery_item_id',m.grocery_item_id).eq('basket_status','sending');
   if(done.error)throw done.error;
   const removed=await db.from('grocery_items').delete().eq('id',m.grocery_item_id);
   if(removed.error)console.error('Sent item cleanup failed',m.grocery_item_id,removed.error.message);
   sent++;
  }catch(e){
   console.error('Tesco basket submission requires review',m.grocery_item_id,e instanceof Error?e.name:'unknown');
   return respond({error:'Basket submission interrupted. '+sent+' items confirmed sent; remaining or in-progress items require review before retrying. Check Tesco basket to avoid duplicates.'},502);
  }
 }
 return respond({message:sent+' grocery item'+(sent===1?'':'s')+' sent to Tesco basket. Successfully sent items are removed from the chalkboard.'});
}
