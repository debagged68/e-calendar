import {createClient} from 'npm:@supabase/supabase-js@2.105.0';
const authority='https://login.microsoftonline.com/consumers/oauth2/v2.0';
const scope='offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Send';
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
async function hash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('')}
async function challenge(value:string){return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')}
Deno.serve(async(request:Request)=>{
 const appUrl=Deno.env.get('ECALENDAR_APP_URL')?.replace(/\/$/,'');
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':appUrl||'null','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return reply({error:'Method not allowed'},405);
 try{
  const token=request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if(!token)return reply({error:'Please sign in to the family calendar.'},401);
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const userResult=await db.auth.getUser(token);const user=userResult.data.user;
  if(userResult.error||!user)return reply({error:'Please sign in again.'},401);
  const body=await request.json();
  const senderResult=await db.rpc('microsoft_sender_read');if(senderResult.error)throw Error('Connection unavailable');
  const sender=senderResult.data;
  const clientId=Deno.env.get('MICROSOFT_CLIENT_ID'),secret=Deno.env.get('MICROSOFT_CLIENT_SECRET');
  const configured=!!(clientId&&secret&&appUrl);
  const redirectUri=appUrl?appUrl+'/microsoft-connect':null;
  if(body.action==='status')return reply({configured,connected:!!sender,email:sender?.email||null,canDisconnect:sender?.connected_by===user.id,redirectUri});
  if(body.action==='disconnect'){
   if(sender&&sender.connected_by!==user.id)return reply({error:'Only the person who connected this Hotmail account can disconnect it.'},403);
   const removed=await db.rpc('microsoft_sender_disconnect',{owner_id:user.id});if(removed.error)throw Error('Could not disconnect');
   return reply({success:true});
  }
  if(!configured)return reply({error:'Microsoft app setup is required before connecting Hotmail.'},503);
  if(sender&&sender.connected_by!==user.id)return reply({error:'Ask the person who connected the current account to disconnect it first.'},403);
  if(body.action==='start'){
   const state=random(),verifier=random();
   const saved=await db.rpc('microsoft_oauth_start',{state_hash:await hash(state),owner_id:user.id,verifier,redirect_uri:redirectUri});
   if(saved.error)throw Error('Unable to start sign-in');
   const url=new URL(authority+'/authorize');url.search=new URLSearchParams({client_id:clientId!,response_type:'code',redirect_uri:redirectUri!,response_mode:'query',scope,state,code_challenge:await challenge(verifier),code_challenge_method:'S256',prompt:'select_account'}).toString();
   return reply({url:url.toString(),state});
  }
  if(body.action==='finish'){
   if(typeof body.state!=='string'||!/^[a-f0-9]{64}$/.test(body.state)||typeof body.code!=='string'||body.code.length>10000)return reply({error:'Invalid Microsoft sign-in response.'},400);
   const consumed=await db.rpc('microsoft_oauth_consume',{state_hash:await hash(body.state),owner_id:user.id});
   if(consumed.error||!consumed.data)return reply({error:'Sign-in expired or was already used. Please connect again.'},400);
   const response=await fetch(authority+'/token',{method:'POST',signal:AbortSignal.timeout(15000),body:new URLSearchParams({client_id:clientId!,client_secret:secret!,grant_type:'authorization_code',code:body.code,redirect_uri:consumed.data.redirect_uri,code_verifier:consumed.data.verifier,scope})});
   const credentials=await response.json();
   if(!response.ok||!credentials.access_token||!credentials.refresh_token)return reply({error:'Microsoft did not complete the connection. Please try connecting again.'},400);
   const profileResponse=await fetch('https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName',{headers:{Authorization:'Bearer '+credentials.access_token},signal:AbortSignal.timeout(15000)});
   const profile=await profileResponse.json();const email=profile.mail||profile.userPrincipalName;
   if(!profileResponse.ok||typeof email!=='string'||!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email))return reply({error:'Microsoft did not return a usable email address.'},400);
   if(!String(credentials.scope).split(' ').some((s:string)=>s.toLowerCase().endsWith('mail.send')))return reply({error:'Permission to send invitations was not granted.'},403);
   const saved=await db.rpc('microsoft_sender_save',{owner_id:user.id,sender_email:email,access_token:credentials.access_token,refresh_token:credentials.refresh_token,expires_at:new Date(Date.now()+Number(credentials.expires_in||3600)*1000).toISOString()});
   if(saved.error)throw Error('Could not save the connection');
   const current=await db.rpc('microsoft_sender_read');
   if(current.error||current.data?.connected_by!==user.id||current.data?.email!==email)return reply({error:'The connected account changed during sign-in. Please try again.'},409);
   return reply({success:true,email});
  }
  return reply({error:'Unknown action'},400);
 }catch{return reply({error:'Could not complete the Microsoft connection. Please try again.'},500)}
});
