import test from 'node:test';
import assert from 'node:assert/strict';
import {clearOldHelper,verifyHelper} from '../scripts/tesco-helper-install.mjs';
test('installer replaces a separately started Tesco helper owned by this user',async()=>{
 let active=true;const stopped=[];
 await clearOldHelper({uid:501,find:async()=>active?[123]:[],inspect:async()=>({uid:501,command:'/usr/local/bin/node /Users/test/e-calendar/scripts/tesco-local-helper.mjs'}),stop:pid=>{stopped.push(pid);active=false},wait:async()=>{}});
 assert.deepEqual(stopped,[123]);
});
test('installer refuses to stop unrelated processes or another user’s helper',async()=>{
 for(const owner of [{uid:501,command:'node unrelated-server.mjs'},{uid:502,command:'node scripts/tesco-local-helper.mjs'}]){
  let stopped=false;
  await assert.rejects(clearOldHelper({uid:501,find:async()=>[123],inspect:async()=>owner,stop:()=>{stopped=true},wait:async()=>{}}),/unrecognised process/);
  assert.equal(stopped,false);
 }
});
test('installer reports a helper that is restarted by another service',async()=>{
 await assert.rejects(clearOldHelper({uid:501,find:async()=>[123],inspect:async()=>({uid:501,command:'node scripts/tesco-local-helper.mjs'}),stop:()=>{},wait:async()=>{}}),/keeps returning/);
});
test('installation is verified against the running protocol, with the required origin',async()=>{
 let calls=0;await verifyHelper({wait:async()=>{},request:async(url,options)=>{
  assert.equal(url,'http://127.0.0.1:47831/status');assert.match(options.headers.Origin,/amplifyapp.com$/);
  return Response.json({protocol:++calls===1?1:2});
 }});assert.equal(calls,2);
 await assert.rejects(verifyHelper({wait:async()=>{},request:async()=>Response.json({status:'failed',error:'aws-login-expired'})}),/version 2 did not start/);
});
