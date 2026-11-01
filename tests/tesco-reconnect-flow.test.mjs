import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),ts=require('typescript'),Module=require('node:module');
require.extensions['.ts']=require.extensions['.tsx']=(module,filename)=>module._compile(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);
const originalEnv={url:process.env.NEXT_PUBLIC_SUPABASE_URL,key:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY};
process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='test-key';
function text(node){if(node==null||typeof node==='boolean')return '';if(typeof node!=='object')return String(node);return Array.isArray(node)?node.map(text).join(''):text(node.props?.children)}
function mount({protocol=2,saveFailure=false}={}){
 const previous={fetch:globalThis.fetch,window:globalThis.window,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};
 const slots=[],effects=[],timers=[],requests=[],redirects=[];let hook=0,dirty=true,tree,basketReads=0;
 const session={accessToken:'tesco-session',customerUuid:'customer',cookies:{},accessTokenExpiry:Date.now()+3600000};
 globalThis.window={location:{search:'?returnTo=%2Fbasket',replace:value=>redirects.push(value)}};
 globalThis.setTimeout=fn=>{const timer={fn,active:true};timers.push(timer);return timer};globalThis.clearTimeout=timer=>{if(timer)timer.active=false};
 globalThis.fetch=async(url,options={})=>{
  requests.push({url,options});
  if(url==='/api/tesco-test?action=basket')return Response.json({}, {status:++basketReads===1?401:200});
  if(url==='/api/tesco-session')return options.method==='POST'?Response.json(saveFailure?{error:'Server compute role cannot save. Do not renew the Mac AWS login.'}:{saved:true},{status:saveFailure?503:200}):Response.json({ready:true});
  if(url.endsWith('/status'))return Response.json({protocol,status:'idle'});
  if(url.endsWith('/reconnect'))return Response.json({started:true,protocol:2},{status:202});
  if(url.endsWith('/result'))return Response.json({status:'ready',session});
  if(url.endsWith('/complete'))return Response.json({complete:true});
  throw Error('Unexpected URL '+url);
 };
 const react={useState(initial){const index=hook++;if(!(index in slots))slots[index]=initial;return [slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;dirty=true}]},useEffect(effect,deps){const index=hook++;const old=slots[index];if(!old||deps.some((value,i)=>value!==old[i])){slots[index]=deps;effects.push(effect)}}};
 const originalLoad=Module._load;
 Module._load=function(name,...args){if(name==='react')return react;if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};if(name==='next/link')return 'a';if(name==='@supabase/supabase-js')return {createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'family-jwt'}}})}})};return originalLoad.call(this,name,...args)};
 let Component;try{for(const file of ['../src/app/tesco-reconnect/page.tsx','../src/lib/browser-client.ts'])delete require.cache[require.resolve(file)];Component=require('../src/app/tesco-reconnect/page.tsx').default}finally{Module._load=originalLoad}
 async function flush(){for(let i=0;i<15;i++){if(dirty){hook=0;dirty=false;tree=Component();for(const effect of effects.splice(0))effect()}await new Promise(resolve=>setImmediate(resolve))}}
 return {requests,redirects,session,flush,get message(){return text(tree)},async poll(){const timer=timers.find(t=>t.active);assert.ok(timer,'Missing polling timer');timer.active=false;await timer.fn();await flush()},close(){Object.assign(globalThis,previous)}};
}
test('the real reconnect page rejects the old helper before it can trigger AWS login',async()=>{
 const app=mount({protocol:1});try{await app.flush();assert.match(app.message,/old Tesco helper/);assert.equal(app.requests.some(r=>r.url.endsWith('/reconnect')),false);assert.equal(app.requests.some(r=>r.options.method==='POST'),false)}finally{app.close()}
});
test('the real reconnect page sends the renewed session to the authenticated server, then verifies Tesco',async()=>{
 const app=mount();try{await app.flush();await app.poll();assert.deepEqual(app.redirects,['/basket']);
  const started=app.requests.find(r=>r.url.endsWith('/reconnect')),saved=app.requests.find(r=>r.url==='/api/tesco-session'&&r.options.method==='POST');
  assert.deepEqual(JSON.parse(saved.options.body),{requestId:JSON.parse(started.options.body).requestId,session:app.session});assert.equal(saved.options.headers.Authorization,'Bearer family-jwt');
  for(const r of app.requests.filter(r=>r.url.startsWith('http://127.0.0.1'))){assert.equal(r.options.headers?.Authorization,undefined);assert.ok(!r.url.includes(app.session.accessToken))}
  assert.ok(app.requests.some(r=>r.url.endsWith('/complete')));
 }finally{app.close()}
});
test('server permission errors remain in the UI and do not falsely report success',async()=>{
 const app=mount({saveFailure:true});try{await app.flush();await app.poll();assert.deepEqual(app.redirects,[]);assert.match(app.message,/Server compute role/);assert.equal(app.requests.some(r=>r.url.endsWith('/complete')),false)}finally{app.close()}
});
test.after(()=>{for(const [key,value] of Object.entries({NEXT_PUBLIC_SUPABASE_URL:originalEnv.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:originalEnv.key})){if(value===undefined)delete process.env[key];else process.env[key]=value}});
