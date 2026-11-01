import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),ts=require('typescript');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const {createClient}=require('@supabase/supabase-js');
const {readInvitationSettings,saveInvitationSettings}=require('../src/lib/invitation-settings.ts');
function fixture(){
 const requests=[],preferences=new Map([['owner',{default_invite_email:'owner@example.com'}]]);
 const db=createClient('https://test.supabase.co','test-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,options)=>{
  const url=new URL(String(input));requests.push({url,options});assert.equal(url.pathname,'/rest/v1/user_settings');
  if(options.method==='GET')return Response.json(preferences.get(url.searchParams.get('user_id').slice(3))||null);
  const payload=JSON.parse(options.body);preferences.set(payload.user_id,{default_invite_email:payload.default_invite_email});return Response.json(preferences.get(payload.user_id));
 }}});return {db,requests,preferences};
}
test('a new person starts without another person’s destination and saves only her own setting',async()=>{
 const {db,preferences}=fixture();assert.equal(await readInvitationSettings(db,'new-person'),null);
 await saveInvitationSettings(db,'new-person','  her-calendar@example.com  ');
 assert.equal((await readInvitationSettings(db,'new-person')).default_invite_email,'her-calendar@example.com');
 assert.equal(preferences.get('owner').default_invite_email,'owner@example.com');
});
test('turning personal invitations off does not change another person’s email',async()=>{
 const {db,preferences}=fixture();await saveInvitationSettings(db,'new-person',' ');
 assert.equal(preferences.get('new-person').default_invite_email,null);assert.equal(preferences.get('owner').default_invite_email,'owner@example.com');
});
test('settings requests never mutate shared household settings or Tesco data',async()=>{
 const {db,requests}=fixture();await readInvitationSettings(db,'owner');await saveInvitationSettings(db,'owner','new@example.com');
 assert.equal(requests[0].url.searchParams.get('user_id'),'eq.owner');assert.equal(JSON.parse(requests[1].options.body).user_id,'owner');assert.equal(requests[1].url.searchParams.get('on_conflict'),'user_id');
});
test('a database or permissions failure is surfaced instead of treating a failed load as new-user setup',async()=>{
 const db=createClient('https://test.supabase.co','test-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async()=>Response.json({message:'Permission denied',code:'42501'},{status:403})}});
 await assert.rejects(readInvitationSettings(db,'owner'),/Permission denied/);await assert.rejects(saveInvitationSettings(db,'owner','her@example.com'),/Permission denied/);
});
