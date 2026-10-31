import {createClient} from 'npm:@supabase/supabase-js@2.105.0';
import {calendarInvitation,base64Utf8,type Invite} from './calendar.ts';
const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
Deno.serve(async (request:Request)=>{
 if(request.method!=='POST')return reply({error:'Method not allowed'},405);
 const token=request.headers.get('X-Calendar-Worker');
 if(!token||!/^[a-f0-9]{64}$/.test(token))return reply({error:'Unauthorized'},401);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 const authorized=await db.rpc('calendar_invite_worker_authorized',{worker_token:token});
 if(authorized.error||authorized.data!==true)return reply({error:'Unauthorized'},401);
 const apiKey=Deno.env.get('RESEND_API_KEY');
 const sender=Deno.env.get('CALENDAR_INVITE_FROM');
 if(!apiKey||!sender||!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(sender)){
  // Leave queued jobs untouched until a verified sender has been configured.
  return reply({error:'Calendar email sender setup required'},503);
 }
 const claimed=await db.rpc('claim_calendar_invites');
 if(claimed.error)return reply({error:'Unable to claim invitations'},500);
 let sent=0,failed=0;
 for(const invite of claimed.data as Invite[]){
  try{
   const calendar=calendarInvitation(invite,sender);
   const response=await fetch('https://api.resend.com/emails',{
    method:'POST',signal:AbortSignal.timeout(15000),
    headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json','Idempotency-Key':'family-invite/'+invite.event_id},
    body:JSON.stringify({from:'Family Calendar <'+sender+'>',to:[invite.recipient],subject:invite.event_snapshot.title,
     text:'You are invited to '+invite.event_snapshot.title+'. Open the attached calendar invitation to accept it in your calendar.',
     attachments:[{filename:'invitation.ics',content:base64Utf8(calendar),content_type:'text/calendar; charset=UTF-8; method=REQUEST'}]})
   });
   const result=await response.json();
   if(!response.ok||!result.id)throw Error('Email provider rejected invitation ('+response.status+')');
   const updated=await db.from('calendar_invites').update({status:'sent',sent_at:new Date().toISOString(),provider_id:result.id,last_error:null}).eq('event_id',invite.event_id).eq('status','sending');
   if(updated.error)throw Error('Unable to record email acceptance');
   sent++;
  }catch(error){
   failed++;
   await db.from('calendar_invites').update({status:'failed',last_error:error instanceof Error?error.message:'Invitation sending failed'}).eq('event_id',invite.event_id).eq('status','sending');
  }
 }
 return reply({sent,failed});
});
