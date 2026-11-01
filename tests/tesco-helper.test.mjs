import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createTescoHelper} from '../scripts/tesco-local-helper.mjs';
import {renewTescoSession} from '../scripts/tesco-browser-session.mjs';
const origin='https://main.d39jquc2st3vwk.amplifyapp.com';
const requestId='00000000-0000-4000-8000-000000000001';
const fresh=()=>({accessToken:'test-token',customerUuid:'customer',cookies:{UUID:'customer'},accessTokenExpiry:Date.now()+3600000});
async function helper(options,run){
 const server=createTescoHelper(options);server.listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port;
 const get=path=>fetch(base+path,{headers:{Origin:origin}});
 const post=(path,body={requestId},from=origin)=>fetch(base+path,{method:'POST',headers:{Origin:from,'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{await run({get,post,base})}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
}
test('expired/missing Mac AWS credentials do not affect browser renewal or the handoff',async()=>{
 const previous=process.env.AWS_PROFILE;process.env.AWS_PROFILE='deliberately-expired-nonexistent-profile';
 try{
  let calls=0;const session=fresh();
  await helper({renew:async()=>{calls++;return session}},async({get,post})=>{
   assert.equal((await (await get('/status')).json()).protocol,2);
   assert.equal((await post('/reconnect')).status,202);
   const result=await (await post('/result')).json();assert.equal(result.status,'ready');assert.deepEqual(result.session,session);assert.equal(calls,1);
   const publicStatus=await (await get('/status')).json();assert.equal('session' in publicStatus,false);
   assert.equal((await post('/complete')).status,200);assert.equal((await post('/result')).status,403);
  });
 }finally{if(previous===undefined)delete process.env.AWS_PROFILE;else process.env.AWS_PROFILE=previous}
});
test('session handoff rejects other origins, wrong nonces and invalid request bodies',async()=>{
 await helper({renew:async()=>fresh()},async({post})=>{
  assert.equal((await post('/reconnect',{requestId},'https://evil.example')).status,403);
  assert.equal((await post('/reconnect',{})).status,400);
  await post('/reconnect');
  assert.equal((await post('/result',{requestId:'00000000-0000-4000-8000-000000000002'})).status,403);
  assert.equal((await post('/result',{requestId},'http://localhost:3000')).status,403);
 });
});
test('parallel reconnects cannot start a second browser or expose another job',async()=>{
 let finish,calls=0;
 await helper({renew:()=>{calls++;return new Promise(resolve=>finish=resolve)}},async({post})=>{
  await post('/reconnect');assert.equal((await post('/reconnect')).status,409);assert.equal(calls,1);
  assert.equal((await (await post('/result')).json()).status,'running');finish(fresh());
 });
});
test('unused fresh-session handoffs expire and browser failures expose no diagnostics',async()=>{
 let now=Date.now();await helper({now:()=>now,renew:async()=>fresh()},async({post})=>{
  await post('/reconnect');now+=120001;assert.equal((await post('/result')).status,403);
 });
 await helper({renew:async()=>{throw Error('private-cookie-diagnostic')}},async({post})=>{
  await post('/reconnect');const response=await (await post('/result')).text();assert.equal(JSON.parse(response).status,'failed');assert.ok(!response.includes('private-cookie'));
 });
});
test('the existing Tesco browser backend is reused without loading a secret or AWS credentials',async()=>{
 const session=fresh();let logins=0;
 const actual=await renewTescoSession({backend:{refresh:async()=>session},login:async()=>{logins++;return session}});
 assert.deepEqual(actual,session);assert.equal(logins,0);
 const fallback=await renewTescoSession({backend:{refresh:async()=>{throw Error('Tesco login required')}},login:async()=>{logins++;return session}});
 assert.deepEqual(fallback,session);assert.equal(logins,1);
});
