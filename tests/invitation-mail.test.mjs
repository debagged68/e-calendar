import test from 'node:test';
import assert from 'node:assert/strict';
import {mailConfiguration,sendInvitation} from '../supabase/functions/calendar-invites/mail.ts';
const invite={event_id:'event-123',recipient:'recipient@hotmail.com',created_at:'2026-10-31T12:34:56Z',event_snapshot:{title:'🛒 Milk\r\nBcc: nobody@example.com',event_date:'2026-11-02',start_at:null,end_at:null}};
const config={apiKey:'test-key',sender:'sender@example.com'};
test('missing or malformed mail configuration cannot enable sending',()=>{
 assert.equal(mailConfiguration(()=>undefined),null);
 assert.equal(mailConfiguration(k=>k==='BREVO_API_KEY'?'key':'sender@example.com\r\nBcc: other@example.com'),null);
 assert.deepEqual(mailConfiguration(k=>k==='BREVO_API_KEY'?' key ':' sender@example.com '),{apiKey:'key',sender:'sender@example.com'});
});
test('provider receives a Unicode ICS request for exactly the configured recipient',async()=>{
 let calls=0;
 const id=await sendInvitation(invite,config,async(url,request)=>{
  calls++;assert.equal(url,'https://api.brevo.com/v3/smtp/email');assert.equal(request.headers['api-key'],'test-key');
  const body=JSON.parse(request.body);assert.deepEqual(body.to,[{email:'recipient@hotmail.com'}]);assert(!/[\r\n]/.test(body.subject));
  assert.equal(body.attachment[0].name,'invitation.ics');const ics=Buffer.from(body.attachment[0].content,'base64').toString('utf8').replace(/\r\n /g,'');
  assert.match(ics,/METHOD:REQUEST/);assert.match(ics,/DTSTART;VALUE=DATE:20261102/);assert.match(ics,/mailto:recipient@hotmail.com/);assert.match(ics,/SUMMARY:🛒 Milk/);
  assert(!JSON.stringify(body).includes('test-key'));
  return Response.json({messageId:'brevo-test-id'},{status:201});
 });assert.equal(id,'brevo-test-id');assert.equal(calls,1);
});
test('only explicit throttling is safe to retry; uncertain submissions are stopped',async()=>{
 for(const [status,retryable,uncertain] of [[429,true,false],[400,false,false],[401,false,false],[503,false,true]]){
  await assert.rejects(sendInvitation(invite,config,async()=>new Response('',{status})),error=>error.retryable===retryable&&error.uncertain===uncertain);
 }
 await assert.rejects(sendInvitation(invite,config,async()=>{throw Error('timeout')}),error=>!error.retryable&&error.uncertain);
 await assert.rejects(sendInvitation(invite,config,async()=>Response.json({},{status:201})),error=>!error.retryable&&error.uncertain);
});
test('malicious calendar envelope is rejected before calling the provider',async()=>{
 let called=false;
 await assert.rejects(sendInvitation({...invite,recipient:'victim@example.com\r\nATTENDEE:evil@example.com'},config,async()=>{called=true;return new Response()}));
 assert.equal(called,false);
});
