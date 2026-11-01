import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),ts=require('typescript'),Module=require('node:module');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const writes=[],clients=[],verified=[];let writeFailure=false,tescoFailure=false;
const originalLoad=Module._load;
Module._load=function(name,...args){
 if(name==='@aws-sdk/client-secrets-manager')return {
  SecretsManagerClient:class{constructor(config){clients.push(config)}async send(command){if(command.read)return {SecretString:JSON.stringify(fresh())};if(writeFailure)throw Error('AccessDeniedException');writes.push(command.input);return {VersionId:command.input.ClientRequestToken}}},
  GetSecretValueCommand:class{constructor(input){this.input=input;this.read=true}},PutSecretValueCommand:class{constructor(input){this.input=input}}
 };
 if(name==='basketeer')return {Basketeer:class{constructor({session}){this.session=session}async favourites(options){if(tescoFailure)throw Error('Rejected');verified.push({session:this.session,options});return {results:[]}}}};
 return originalLoad.call(this,name,...args);
};
let POST,GET;try{({POST,GET}=require('../src/app/api/tesco-session/route.ts'))}finally{Module._load=originalLoad}
const {NextRequest}=require('next/server');
const requestId='00000000-0000-4000-8000-000000000001';
const fresh=()=>({accessToken:'test-session-not-for-response',customerUuid:'customer',cookies:{UUID:'customer'},accessTokenExpiry:Date.now()+3600000});
function request(body,authenticated=true,extraHeaders={}){return new NextRequest('https://calendar.example/api/tesco-session',{method:'POST',headers:{...(authenticated?{Authorization:'Bearer family-jwt'}:{}),'Content-Type':'application/json',...extraHeaders},body:JSON.stringify(body)})}
const savedEnv={...process.env},originalFetch=globalThis.fetch;
process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='test-key';
delete process.env.TESCO_SESSION_B64;delete process.env.TESCO_SECRET_ID;delete process.env.AWS_REGION;
globalThis.fetch=async(url)=>{assert.match(String(url),/\/auth\/v1\/user/);return Response.json({id:'family-user'})};
test('signed-in app transfers a Tesco-verified session to the server role, without Mac AWS credentials',async()=>{
 const session=fresh(),before=writes.length;
 const response=await POST(request({requestId,session,secretId:'attacker-cannot-choose-secret'}));
 assert.equal(response.status,200);const result=await response.json();assert.equal(result.saved,true);assert.equal('session' in result,false);assert.ok(!JSON.stringify(result).includes(session.accessToken));
 assert.deepEqual(verified.at(-1),{session,options:{limit:1}});
 assert.equal(writes.length,before+1);assert.equal(writes.at(-1).SecretId,'e-calendar/tesco-session');assert.equal(writes.at(-1).ClientRequestToken,requestId);assert.deepEqual(JSON.parse(writes.at(-1).SecretString),session);assert.deepEqual(clients.at(-1),{region:'eu-north-1'});
});
test('unauthenticated, oversized, malformed or expired handoffs never write a secret',async()=>{
 const before=writes.length;
 assert.equal((await POST(request({requestId,session:fresh()},false))).status,401);
 assert.equal((await POST(request({requestId,session:fresh()},true,{'content-length':'70001'}))).status,413);
 assert.equal((await POST(request({requestId:'invalid',session:fresh()}))).status,400);
 assert.equal((await POST(request({requestId,session:{...fresh(),accessTokenExpiry:Date.now()-1000}}))).status,422);
 assert.equal((await POST(request({requestId,session:fresh()},true,{'Content-Type':'text/plain'}))).status,415);
 assert.equal(writes.length,before);
});
test('a rejected Tesco login cannot replace the stored household session',async()=>{
 const before=writes.length;tescoFailure=true;
 try{assert.equal((await POST(request({requestId,session:fresh()}))).status,422);assert.equal(writes.length,before)}finally{tescoFailure=false}
});
test('server IAM failure gives server configuration guidance instead of asking for Mac AWS login',async()=>{
 writeFailure=true;try{const result=await POST(request({requestId,session:fresh()}));assert.equal(result.status,503);const body=await result.json();assert.match(body.error,/Amplify compute role/);assert.match(body.error,/do not renew the AWS login on your Mac/);assert.ok(!body.error.includes('test-session-not-for-response'))}finally{writeFailure=false}
});
test('a fixed server session override is detected before accepting an ineffective update',async()=>{
 const before=writes.length;process.env.TESCO_SESSION_B64='stale-override';
 try{const result=await POST(request({requestId,session:fresh()}));assert.equal(result.status,503);assert.match((await result.json()).error,/Remove TESCO_SESSION_B64/);assert.equal(writes.length,before)}finally{delete process.env.TESCO_SESSION_B64}
});
test('preflight checks server AWS access without exposing the saved session',async()=>{
 const result=await GET(request(null));assert.equal(result.status,200);assert.deepEqual(await result.json(),{ready:true,awsAccess:'server'});
 assert.equal((await GET(request(null,false))).status,401);
});
test.after(()=>{globalThis.fetch=originalFetch;for(const key of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','TESCO_SESSION_B64','TESCO_SECRET_ID','AWS_REGION']){if(savedEnv[key]===undefined)delete process.env[key];else process.env[key]=savedEnv[key]}});
