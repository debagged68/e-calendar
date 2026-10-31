import {createClient} from 'npm:@supabase/supabase-js@2.105.0';
import {invitationMime,base64Utf8,type Invite} from './calendar.ts';
const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
Deno.serve(async(request:Request)=>{
 if(request.method!=='POST')return reply({error:'Method not allowed'},405);
 const token=request.headers.get('X-Calendar-Worker');
 if(!token||!/^[a-f0-9]{64}$/.test(token))return reply({error:'Unauthorized'},401);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 const authorized=await db.rpc('calendar_invite_worker_authorized',{worker_token:token});
 if(authorized.error||authorized.data!==true)return reply({error:'Unauthorized'},401);
 const result=await db.rpc('microsoft_sender_read');
 let sender=result.data;
 const clientId=Deno.env.get('MICROSOFT_CLIENT_ID'),secret=Deno.env.get('MICROSOFT_CLIENT_SECRET');
 if(result.error||!sender||!clientId||!secret)return reply({error:'Connect Hotmail in Calendar settings to send invitations.'},503);
 async function refresh(){
  const oldRefreshToken=sender.refresh_token;
  const response=await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token',{method:'POST',signal:AbortSignal.timeout(15000),body:new URLSearchParams({client_id:clientId!,client_secret:secret!,grant_type:'refresh_token',refresh_token:sender.refresh_token})});
  const credentials=await response.json();
  if(!response.ok||!credentials.access_token)throw Error('Please reconnect Hotmail in Calendar settings.');
  sender={...sender,access_token:credentials.access_token,refresh_token:credentials.refresh_token||sender.refresh_token,expires_at:new Date(Date.now()+Number(credentials.expires_in||3600)*1000).toISOString()};
  const saved=await db.rpc('microsoft_sender_renew',{old_refresh_token:oldRefreshToken,owner_id:sender.connected_by,sender_email:sender.email,access_token:sender.access_token,refresh_token:sender.refresh_token,expires_at:sender.expires_at});
  if(saved.error||saved.data!==true)throw Error('The Hotmail connection changed. Please retry.');
 }
 try{if(new Date(sender.expires_at).getTime()<Date.now()+60000)await refresh()}
 catch{return reply({error:'Hotmail needs reconnecting in Calendar settings.'},503)}
 const claimed=await db.rpc('claim_calendar_invites');
 if(claimed.error)return reply({error:'Unable to claim invitations'},500);
 let sent=0,failed=0;
 for(const invite of claimed.data as Invite[]){
  let submissionStarted=false;
  try{
   const mime=base64Utf8(invitationMime(invite,sender.email));
   const submit=()=>fetch('https://graph.microsoft.com/v1.0/me/sendMail',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+sender.access_token,'Content-Type':'text/plain'},body:mime});
   submissionStarted=true;
   let response=await submit();
   if(response.status===401){submissionStarted=false;await refresh();submissionStarted=true;response=await submit()}
   if(response.status!==202){
    // Explicit refusal is safe to retry for throttling. Other refusals need attention.
    submissionStarted=false;
    const retry=response.status===429;
    await db.from('calendar_invites').update({status:'failed',...(retry?{}:{attempts:5}),last_error:retry?'Hotmail is busy. Will retry shortly.':'Hotmail rejected the invitation ('+response.status+'). Reconnect or check permissions.'}).eq('event_id',invite.event_id).eq('status','sending');
    failed++;continue;
   }
   const saved=await db.from('calendar_invites').update({status:'sent',sent_at:new Date().toISOString(),provider_id:'microsoft:'+invite.event_id,last_error:null}).eq('event_id',invite.event_id).eq('status','sending');
   if(saved.error)throw Error('Could not record email acceptance');
   sent++;
  }catch{
   failed++;
   await db.from('calendar_invites').update({status:'failed',attempts:5,last_error:submissionStarted?'Delivery uncertain. Check Hotmail Sent Items before sending again.':'Invitation could not be sent. Please check the Hotmail connection.'}).eq('event_id',invite.event_id).eq('status','sending');
  }
 }
 return reply({sent,failed});
});
