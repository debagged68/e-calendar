import {createClient} from 'npm:@supabase/supabase-js@2.105.0';
import type {Invite} from './calendar.ts';
import {mailConfiguration,sendInvitation,MailFailure} from './mail.ts';
const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
Deno.serve(async(request:Request)=>{
 if(request.method!=='POST'&&request.method!=='GET')return reply({error:'Method not allowed'},405);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 const config=mailConfiguration(key=>Deno.env.get(key));
 if(request.method==='GET'){
  const bearer=request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if(!bearer)return reply({error:'Please sign in.'},401);
  const {data,error}=await db.auth.getUser(bearer);
  if(error||!data.user)return reply({error:'Please sign in.'},401);
  return reply({configured:!!config,provider:'Brevo'});
 }
 const token=request.headers.get('X-Calendar-Worker');
 if(!token||!/^[a-f0-9]{64}$/.test(token))return reply({error:'Unauthorized'},401);
 const authorized=await db.rpc('calendar_invite_worker_authorized',{worker_token:token});
 if(authorized.error||authorized.data!==true)return reply({error:'Unauthorized'},401);
 // Never consume attempts while the independent mail service is unconfigured.
 if(!config)return reply({error:'Email service setup needed: configure BREVO_API_KEY and CALENDAR_FROM_EMAIL in Supabase Edge Function Secrets.'},503);
 // Recover abandoned submissions without suggesting the old Hotmail Sent Items.
 const stale=await db.from('calendar_invites').update({status:'failed',attempts:5,last_error:'Delivery uncertain. Check email provider logs before sending again.'}).eq('status','sending').lt('attempted_at',new Date(Date.now()-5*60000).toISOString());
 if(stale.error)return reply({error:'Unable to check previous submissions'},500);
 const claimed=await db.rpc('claim_calendar_invites');
 if(claimed.error)return reply({error:'Unable to claim invitations'},500);
 let sent=0,failed=0;
 for(const invite of claimed.data as Invite[]){
  let accepted=false;
  try{
   const providerId=await sendInvitation(invite,config);accepted=true;
   const saved=await db.from('calendar_invites').update({status:'sent',sent_at:new Date().toISOString(),provider_id:providerId,last_error:null}).eq('event_id',invite.event_id).eq('status','sending');
   if(saved.error)throw Error('Could not record email acceptance');
   sent++;
  }catch(error){
   failed++;
   const failure=error instanceof MailFailure?error:null;
   const uncertain=accepted||failure?.uncertain;
   await db.from('calendar_invites').update({status:'failed',...(failure?.retryable?{}:{attempts:5}),last_error:uncertain?'Delivery uncertain. Check Brevo transactional email logs before sending again.':failure?.message||'Invalid invitation. Please check the event details.'}).eq('event_id',invite.event_id).eq('status','sending');
  }
 }
 return reply({sent,failed});
});
