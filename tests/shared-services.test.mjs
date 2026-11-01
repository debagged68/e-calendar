import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),ts=require('typescript');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const {createClient}=require('@supabase/supabase-js');
const {collectingList,addGroceryEntries,parseGroceryEntry}=require('../src/lib/groceries.ts');
const {loadTescoSession}=require('../src/lib/server/tesco-session.ts');
const {saveTescoDelivery}=require('../src/lib/server/tesco-delivery.ts');
const {authenticatedUser}=require('../src/lib/server/user.ts');
const good={accessToken:'test',customerUuid:'customer',cookies:{},accessTokenExpiry:Date.now()+3600000};
const client=fetch=>createClient('https://test.supabase.co','test-key',{global:{fetch},auth:{persistSession:false,autoRefreshToken:false}});
const response=(data,status=200)=>Response.json(data,{status});
test('simultaneous collecting-list creation recovers the database constraint winner',async()=>{
 const calls=[];
 const db=client(async(url,options)=>{
  calls.push({url:String(url),method:options.method});
  if(options.method==='POST')return response({code:'23505',message:'one_collecting_grocery_list'},409);
  return response(calls.length===1?[]:[{id:'winner',event_id:null}]);
 });
 assert.equal((await collectingList(db)).id,'winner');assert.deepEqual(calls.map(x=>x.method),['GET','POST','GET']);
});
test('read-only shopping summary never creates a collecting list',async()=>{
 const methods=[];const db=client(async(_url,options)=>{methods.push(options.method);return response([])});
 assert.equal(await collectingList(db,false),null);assert.deepEqual(methods,['GET']);
});
test('list creation failures other than uniqueness are surfaced without retrying',async()=>{
 let calls=0;const db=client(async(_url,options)=>{calls++;return options.method==='POST'?response({code:'42501',message:'Denied'},403):response([])});
 await assert.rejects(collectingList(db),/Denied/);assert.equal(calls,2);
});
test('whiteboard and Quick Action share case-insensitive quantity merging',async()=>{
 const writes=[];const db=client(async(_url,options)=>{
  if(options.method==='GET')return response([{id:'milk',name:'Milk',quantity:2,unit:''}]);
  writes.push(JSON.parse(options.body));return new Response(null,{status:204});
 });
 await addGroceryEntries(db,'list',[parseGroceryEntry('3 milk'),{name:'MILK',quantity:1},{name:'apples',quantity:2},{name:'Apples',quantity:1}]);
 assert.deepEqual(writes,[{quantity:6},{list_id:'list',name:'apples',quantity:3}]);
});
test('invalid batches and combined quantity overflow are rejected before any write',async()=>{
 let writes=0;const db=client(async(_url,options)=>{if(options.method==='GET')return response([{id:'milk',name:'milk',quantity:999,unit:''}]);writes++;return response(null)});
 await assert.rejects(addGroceryEntries(db,'list',[{name:'apples',quantity:1},{name:'',quantity:2}]));
 await assert.rejects(addGroceryEntries(db,'list',[{name:'apples',quantity:1},{name:'milk',quantity:1}]));
 assert.equal(writes,0);
});
test('both Tesco routes can use the same base64 session without reading AWS',async()=>{
 const session=await loadTescoSession({TESCO_SESSION_B64:Buffer.from(JSON.stringify(good)).toString('base64')},()=>{throw Error('Unexpected AWS call')});
 assert.deepEqual(session,good);
});
test('Tesco session has one AWS region/default and supports binary or string secret values',async()=>{
 const reads=[];
 for(const binary of [false,true]){
  const result=await loadTescoSession({},async(region,id)=>{reads.push({region,id});return binary?{SecretBinary:Buffer.from(JSON.stringify(good))}:{SecretString:JSON.stringify(good)}});
  assert.deepEqual(result,good);
 }
 assert.deepEqual(reads,[{region:'eu-north-1',id:'e-calendar/tesco-session'},{region:'eu-north-1',id:'e-calendar/tesco-session'}]);
});
test('Tesco rejects invalid, missing-expiry and near-expiry sessions before external work',async()=>{
 for(const value of ['null','invalid',JSON.stringify({...good,accessTokenExpiry:undefined}),JSON.stringify({...good,accessTokenExpiry:Date.now()+20000})])
  await assert.rejects(loadTescoSession({TESCO_SESSION_B64:Buffer.from(value).toString('base64')},()=>{throw Error('Unexpected AWS call')}),/INVALID_SESSION|EXPIRED/);
});
test('reserved slots and confirmed deliveries share stable-ID update/insert logic',async()=>{
 for(const existing of [null,{id:'already-there'}]){
  const requests=[];const db=client(async(url,options)=>{
   requests.push({url:String(url),method:options.method,body:options.body?JSON.parse(options.body):null});
   return options.method==='GET'?response(existing):response({id:existing?.id||'new'});
  });
  const result=await saveTescoDelivery(db,'owner',{id:'reserved-slot:slot-1',title:'Tesco delivery (reserved)',start:'2026-11-07T10:00:00Z',end:'2026-11-07T11:00:00Z'});
  assert.deepEqual(result,{eventId:existing?.id||'new',created:!existing});
  assert.match(requests[0].url,/tesco_order_id=eq.reserved-slot/);
  assert.equal(requests[1].method,existing?'PATCH':'POST');
  assert.equal(requests[1].body.event_date,'2026-11-07');
  if(!existing){assert.equal(requests[1].body.created_by,'owner');assert.equal(requests[1].body.tesco_order_id,'reserved-slot:slot-1')}
 }
});
test('server auth verifies the token and carries that user JWT into RLS database requests',async()=>{
 const previous={fetch:globalThis.fetch,url:process.env.NEXT_PUBLIC_SUPABASE_URL,key:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY};
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='test-key';
 const headers=[];globalThis.fetch=async(url,options)=>{headers.push(new Headers(options.headers).get('authorization'));return String(url).includes('/auth/')?response({id:'owner'}):response([])};
 try{
  assert.equal(await authenticatedUser(new Request('https://example.test')),null);
  const auth=await authenticatedUser(new Request('https://example.test',{headers:{Authorization:'Bearer caller-jwt'}}));
  assert.equal(auth.user.id,'owner');await auth.db.from('family_events').select('id');
  assert.deepEqual(headers,['Bearer caller-jwt','Bearer caller-jwt']);
 }finally{globalThis.fetch=previous.fetch;for(const [key,value] of Object.entries({NEXT_PUBLIC_SUPABASE_URL:previous.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:previous.key})){if(value===undefined)delete process.env[key];else process.env[key]=value}}
});
test('retired integrations return an explicit response without accessing credentials or networks',async()=>{
 const {retiredIntegration}=require('../supabase/functions/_shared/retired.ts');
 const {POST}=require('../src/app/api/microsoft-connect/route.ts');
 for(const result of [retiredIntegration('Per-user Hotmail feed'),await POST()]){
  assert.equal(result.status,410);assert.match((await result.json()).error,/retired/);assert.equal(result.headers.get('cache-control'),'no-store');
 }
});
test('Tesco read and commit routes share session loading and preserve transfer reservation',async()=>{
 const Module=require('node:module'),originalLoad=Module._load;
 const sessions=[],added=[],states=[];let transferred=false;
 class FakeTesco{
  constructor({session}){sessions.push(session)}
  favourites=async()=>({results:[]});
  basket={add:async(sku,quantity)=>{assert.deepEqual(states,['sending']);added.push({sku,quantity});return {items:[]}}};
 }
 let read,commit;
 Module._load=function(name,...args){if(name==='basketeer')return {Basketeer:FakeTesco};return originalLoad.call(this,name,...args)};
 try{read=require('../src/app/api/tesco-test/route.ts').GET;commit=require('../src/app/api/tesco-basket-commit/route.ts').POST}finally{Module._load=originalLoad}
 const {NextRequest}=require('next/server');
 const saved={fetch:globalThis.fetch,env:{...process.env}};
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='test-key';
 process.env.TESCO_SESSION_B64=Buffer.from(JSON.stringify(good)).toString('base64');
 globalThis.fetch=async(input,options)=>{
  const url=new URL(String(input));
  if(url.pathname==='/auth/v1/user')return response({id:'owner'});
  assert.equal(new Headers(options.headers).get('authorization'),'Bearer caller-jwt');
  const table=url.pathname.split('/').at(-1),body=options.body?JSON.parse(options.body):null;
  if(table==='grocery_lists')return response({id:'00000000-0000-4000-8000-000000000001',status:'collecting',event_id:null});
  if(table==='grocery_items')return options.method==='DELETE'?new Response(null,{status:204}):response([{id:'item1',quantity:1}]);
  if(table==='grocery_item_products'){
   if(options.method==='GET')return response(transferred?[]:[{grocery_item_id:'item1',tesco_sku:'254797214',basket_status:'selected'}]);
   states.push(body.basket_status);
   if(body.basket_status==='sending')return response([{grocery_item_id:'item1'}]);
   transferred=true;return new Response(null,{status:204});
  }
  throw Error('Unexpected request '+url);
 };
 const headers={Authorization:'Bearer caller-jwt','Content-Type':'application/json'};
 const request=()=>new NextRequest('https://calendar.test/api/tesco-basket-commit',{method:'POST',headers,body:JSON.stringify({listId:'00000000-0000-4000-8000-000000000001'})});
 try{
  const readResult=await read(new NextRequest('https://calendar.test/api/tesco-test?action=favourites',{headers}));assert.equal(readResult.status,200);
  assert.equal((await commit(request())).status,200);
  assert.deepEqual(sessions,[good,good]);assert.deepEqual(states,['sending','sent']);assert.deepEqual(added,[{sku:'254797214',quantity:1}]);
  assert.equal((await commit(request())).status,400);assert.equal(added.length,1);
  const unauthenticated=await read(new NextRequest('https://calendar.test/api/tesco-test?action=favourites'));assert.equal(unauthenticated.status,401);assert.equal(sessions.length,2);
 }finally{globalThis.fetch=saved.fetch;for(const key of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','TESCO_SESSION_B64']){if(saved.env[key]===undefined)delete process.env[key];else process.env[key]=saved.env[key]}}
});
