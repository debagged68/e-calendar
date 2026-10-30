import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {POST as classify} from '../interpret-entry/route';
import {POST as interpretAppointment} from '../interpret-appointment/route';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const noStore={'Cache-Control':'no-store'};
function answer(message:string,ok:boolean,status=200,extra:Record<string,unknown>={}){
 return NextResponse.json({success:ok,spoken:message,message,...extra},{status,headers:noStore});
}
function validDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))}
function validTime(value:string){return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)}
function localDateTime(date:string,time:string){
 const wall=Date.parse(date+'T'+time+':00Z');
 const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 let utc=wall;
 for(let i=0;i<3;i++){
  const parts=Object.fromEntries(fmt.formatToParts(new Date(utc)).map(p=>[p.type,p.value]));
  const shown=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute));
  utc+=wall-shown;
 }
 return new Date(utc);
}
export async function POST(request:NextRequest){
 try{
  const bearer=request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if(!bearer)return answer('Please sign in to E-Calendar and reconnect your Siri Shortcut.',false,401);
  const body=await request.json().catch(()=>null) as {text?:unknown;requestId?:unknown}|null;
  const description=typeof body?.text==='string'?body.text.trim():'';
  if(!description||description.length>1500)return answer('Please say a shorter instruction.',false,400);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)return answer('Calendar configuration is unavailable.',false,503);
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+bearer}}});
  const auth=await db.auth.getUser(bearer);
  if(auth.error||!auth.data.user)return answer('Please sign in to E-Calendar and reconnect your Siri Shortcut.',false,401);
  const user=auth.data.user;
  const token=bearer;
  const requestId=typeof body?.requestId==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(body.requestId)?body.requestId:null;
  // A Shortcut can retry a network request. Reject the same request ID for a short period
  // only when a durable deduplication store is configured; otherwise clients must not retry automatically.
  const headers={authorization:'Bearer '+token,'content-type':'application/json'};
  const classified=await classify(new NextRequest(request.url,{method:'POST',headers,body:JSON.stringify({description})}));
  const classification=await classified.json() as {intent?:string;items?:{name:string;quantity:number}[];error?:string};
  if(!classified.ok)return answer('I could not understand that instruction. Please try again.',false,classified.status);
  if(classification.intent==='groceries'){
   const entries=classification.items||[];
   if(!entries.length||entries.length>30)return answer('I could not identify the groceries. Please try again.',false,422);
   const validated=entries.map(x=>({name:typeof x.name==='string'?x.name.trim():'' ,quantity:x.quantity}));
   if(validated.some(x=>!x.name||x.name.length>160||!Number.isInteger(x.quantity)||x.quantity<1||x.quantity>999)){
    return answer('I could not identify the groceries clearly.',false,422);
   }
   const list=await db.from('grocery_lists').select('id').eq('status','collecting').order('created_at',{ascending:true}).limit(1);
   if(list.error)throw list.error;
   let listId=list.data?.[0]?.id;
   if(!listId){
    const created=await db.from('grocery_lists').insert({status:'collecting'}).select('id').single();
    if(created.error)throw created.error;
    listId=created.data.id;
   }
   const existing=await db.from('grocery_items').select('id,name,quantity').eq('list_id',listId).limit(500);
   if(existing.error)throw existing.error;
   const merged=new Map<string,{name:string;quantity:number}>();
   for(const x of validated){
    const normalized=x.name.toLocaleLowerCase('en-GB');
    const prior=merged.get(normalized);
    merged.set(normalized,{name:prior?.name||x.name,quantity:(prior?.quantity||0)+x.quantity});
   }
   if([...merged.values()].some(x=>x.quantity>999))return answer('That grocery quantity is too large.',false,422);
   const saved:string[]=[];
   for(const [normalized,x] of merged){
    const found=existing.data?.find(v=>v.name.toLocaleLowerCase('en-GB')===normalized);
    const result=found?await db.from('grocery_items').update({quantity:found.quantity+x.quantity}).eq('id',found.id):await db.from('grocery_items').insert({list_id:listId,name:x.name,quantity:x.quantity});
    if(result.error)throw result.error;
    saved.push((x.quantity>1?x.quantity+' ':'')+x.name);
   }
   return answer('Added '+saved.join(', ')+' to the shopping whiteboard.',true,200,{intent:'groceries',items:validated,requestId});
  }
  if(classification.intent==='appointment'){
   const interpreted=await interpretAppointment(new NextRequest(request.url,{method:'POST',headers,body:JSON.stringify({description})}));
   const event=await interpreted.json() as {title?:string;date?:string;time?:string;endDate?:string;endTime?:string};
   if(!interpreted.ok)return answer('I could not understand the calendar event. Please try again.',false,interpreted.status);
   if(!event.title?.trim()||!event.date||!validDate(event.date)||!event.time||!validTime(event.time)){
    return answer('I need a clear event name, date and time. Please say the instruction again.',false,422);
   }
   const start=localDateTime(event.date,event.time);
   const endDate=event.endDate||event.date;
   const endTime=event.endTime||'';
   if(!validDate(endDate)||(endTime&&!validTime(endTime)))return answer('I could not determine the event end time.',false,422);
   const end=endTime?localDateTime(endDate,endTime):new Date(start.getTime()+3600000);
   if(Number.isNaN(start.getTime())||end<=start)return answer('The event end time must be after its start.',false,422);
   const created=await db.from('family_events').insert({title:event.title.trim(),event_date:event.date,start_at:start.toISOString(),end_at:end.toISOString(),important:false,created_by:user.id});
   if(created.error)throw created.error;
   const spokenDate=new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long',timeZone:'Europe/London'}).format(start);
   return answer('Added '+event.title.trim()+' to the family calendar for '+spokenDate+' at '+event.time+'.',true,200,{intent:'appointment',requestId});
  }
  return answer('I could not tell whether that was an event or groceries. Please rephrase it.',false,422);
 }catch(e){
  console.error('Siri shortcut request failed',e instanceof Error?e.name:'Unknown');
  return answer('Sorry, I could not save that. Please try again later.',false,500);
 }
}
