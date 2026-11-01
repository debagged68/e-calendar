import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
const require=createRequire(import.meta.url),ts=require('typescript');
const Module=require('node:module');
require.extensions['.ts']=require.extensions['.tsx']=(module,filename)=>module._compile(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);
const originalEnv={url:process.env.NEXT_PUBLIC_SUPABASE_URL,key:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY};
process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='test-key';
const phrase="Run test 74 next Saturday 10 o'clock";
const draft={title:'Run test 74',date:'2026-11-07',time:'10:00',endDate:'',endTime:''};
function text(node){if(node==null||typeof node==='boolean')return '';if(typeof node!=='object')return String(node);if(Array.isArray(node))return node.map(text).join('');return text(node.props?.children)}
function find(node,predicate){if(!node||typeof node!=='object')return null;if(Array.isArray(node)){for(const child of node){const found=find(child,predicate);if(found)return found}return null}if(predicate(node))return node;return find(node.props?.children,predicate)}
// Execute the real Quick Action component with controlled React hooks and mocked I/O.
// This exercises its actual event handlers/effects without an external account or browser.
function mount({automatic=false,description=phrase,intent='appointment',event=draft,signedIn=true,emptyBasket=false}={}){
 const previous={window:globalThis.window,fetch:globalThis.fetch};
 const user={id:'test-user'},slots=[],effects=[],writes=[],requests=[],items=[];
 let listExists=!emptyBasket,currentUser=signedIn?user:null,authCallback,releaseLogin,hook=0,dirty=true,tree;
 const location={search:automatic?'?'+new URLSearchParams({text:description,autorun:'1'}):''};
 globalThis.window={location,history:{replaceState(_state,_title,url){location.search=new URL(url,'https://calendar.example').search}}};
 globalThis.fetch=async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});if(url==='/api/interpret-entry')return Response.json({intent,items:[{name:'apples',quantity:2}]});if(url==='/api/interpret-appointment')return Response.json(event);throw Error('Unexpected endpoint '+url)};
 const react={
  useState(initial){const index=hook++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return [slots[index],value=>{const next=typeof value==='function'?value(slots[index]):value;if(!Object.is(next,slots[index])){slots[index]=next;dirty=true}}]},
  useRef(initial){const index=hook++;return slots[index]??(slots[index]={current:initial})},
  useEffect(effect,deps){const index=hook++;const old=slots[index];if(!old||deps.some((value,i)=>!Object.is(value,old[i]))){slots[index]=deps;effects.push(effect)}}
 };
 function from(table){const query={operation:'select',payload:null,filters:{}};const chain={
  select(){return chain},eq(key,value){query.filters[key]=value;return chain},order(){return chain},limit(){return chain},single(){query.single=true;return chain},
  insert(payload){query.operation='insert';query.payload=payload;return chain},update(payload){query.operation='update';query.payload=payload;return chain},
  then(resolve,reject){return Promise.resolve().then(()=>{
   if(table==='grocery_lists'&&query.operation==='insert')listExists=true;
   if(query.operation!=='select'){writes.push({table,operation:query.operation,payload:query.payload});if(table==='grocery_items'&&query.operation==='insert')items.push({id:'item',...query.payload});if(table==='grocery_items'&&query.operation==='update')Object.assign(items.find(item=>item.id===query.filters.id),query.payload)}
   return {error:null,data:table==='grocery_lists'?(query.operation==='insert'?{id:'list'}:listExists?[{id:'list',event_id:null}]:[]):table==='grocery_items'?(query.single?items.at(-1):items):[]};
  }).then(resolve,reject)}
 };return chain}
 const db={from,auth:{getUser:async()=>({data:{user:currentUser}}),getSession:async()=>({data:{session:currentUser?{access_token:'test-token'}:null}}),onAuthStateChange(callback){authCallback=callback;return {data:{subscription:{unsubscribe(){}}}}},async signInWithPassword(){currentUser=user;authCallback('SIGNED_IN',{user});await new Promise(resolve=>releaseLogin=resolve);return {error:null}}}};
 const load=Module._load;
 Module._load=function(name,...args){if(name==='react')return react;if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};if(name==='@supabase/supabase-js')return {createClient:()=>db};return load.call(this,name,...args)};
 let Component;
 try{const filename=require.resolve('../src/app/add/page.tsx');delete require.cache[filename];delete require.cache[require.resolve('../src/lib/browser-client.ts')];delete require.cache[require.resolve('../src/lib/use-browser-user.ts')];Component=require(filename).default}finally{Module._load=load}
 function render(){hook=0;dirty=false;tree=Component();const pending=effects.splice(0);for(const effect of pending)effect()}
 async function flush(){let idle=0;for(let i=0;i<50;i++){if(dirty)render();await new Promise(resolve=>setImmediate(resolve));if(!dirty&&!effects.length){if(++idle===2)return}else idle=0}throw Error('Component did not settle')}
 return {writes,requests,location,flush,get tree(){return tree},
  async enter(value){find(tree,node=>node.type==='textarea').props.onChange({target:{value}});await flush()},
  async click(label){const button=find(tree,node=>node.type==='button'&&text(node)===label);assert.ok(button,'Missing button '+label);button.props.onClick();await flush()},
  async beginLogin(){find(tree,node=>node.type==='form').props.onSubmit({preventDefault(){}});await flush()},
  async finishLogin(){releaseLogin();await flush()},
  rerender(){dirty=true},
  close(){globalThis.window=previous.window;globalThis.fetch=previous.fetch}
 };
}
test('manual and Shortcut input use the same Quick Action interpretation and event save',async()=>{
 const direct=mount();let expected;
 try{await direct.flush();await direct.enter(phrase);await direct.click('Continue');assert.equal(direct.writes.filter(x=>x.table==='family_events').length,0,'Direct entry still requires review');await direct.click('ADD TO CALENDAR');expected=direct.writes.filter(x=>x.table==='family_events');assert.equal(expected.length,1)}finally{direct.close()}
 const shortcut=mount({automatic:true});
 try{await shortcut.flush();assert.deepEqual(shortcut.writes.filter(x=>x.table==='family_events'),expected);assert.deepEqual(shortcut.requests.map(x=>x.url),['/api/interpret-entry','/api/interpret-appointment']);for(const request of shortcut.requests)assert.equal(request.body.description,phrase);assert.equal(shortcut.location.search,'');shortcut.rerender();await shortcut.flush();assert.equal(shortcut.writes.filter(x=>x.table==='family_events').length,1);
  await shortcut.enter(phrase);await shortcut.click('Continue');assert.equal(shortcut.writes.filter(x=>x.table==='family_events').length,1,'Automatic mode must end after the first submission');
 }finally{shortcut.close()}
});
test('manual and Shortcut grocery entry perform identical writes',async()=>{
 let expected;
 for(const automatic of [false,true]){const app=mount({automatic,intent:'groceries',description:'Add 2 apples'});try{await app.flush();if(!automatic){await app.enter('Add 2 apples');await app.click('Continue')}const actual=app.writes.filter(x=>x.table==='grocery_items');assert.equal(actual.length,1);if(!automatic)expected=actual;else assert.deepEqual(actual,expected)}finally{app.close()}}
});
test('automatic entry waits for login, including the busy sign-in interval',async()=>{
 const app=mount({automatic:true,signedIn:false});try{await app.flush();assert.equal(app.requests.length,0);await app.beginLogin();assert.equal(app.requests.length,0);await app.finishLogin();assert.equal(app.writes.filter(x=>x.table==='family_events').length,1)}finally{app.close()}
});
test('both entry points use the same save validation and reject an invalid end',async()=>{
 for(const automatic of [false,true]){const app=mount({automatic,event:{...draft,endDate:'2026-11-07',endTime:'09:00'}});try{await app.flush();if(!automatic){await app.enter(phrase);await app.click('Continue');await app.click('ADD TO CALENDAR')}assert.equal(app.writes.filter(x=>x.table==='family_events').length,0);assert.match(text(app.tree),/End must be after start/)}finally{app.close()}}
});
test('existing /siri URLs only redirect the unchanged text; no Siri processing API remains',async()=>{
 const load=Module._load;Module._load=function(name,...args){if(name==='next/navigation')return {redirect(url){throw {redirect:url}}};return load.call(this,name,...args)};
 let Siri;
 try{Siri=require('../src/app/siri/page.tsx').default}finally{Module._load=load}
 const input=phrase+' & café';
 await assert.rejects(Siri({searchParams:Promise.resolve({text:input})}),error=>{const url=new URL(error.redirect,'https://calendar.example');assert.equal(url.pathname,'/add');assert.equal(url.searchParams.get('text'),input);assert.equal(url.searchParams.get('autorun'),'1');return true});
 assert.equal(existsSync(new URL('../src/app/api/siri/route.ts',import.meta.url)),false);
});
test.after(()=>{for(const [key,value] of Object.entries({NEXT_PUBLIC_SUPABASE_URL:originalEnv.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:originalEnv.key})){if(value===undefined)delete process.env[key];else process.env[key]=value}});

test('automatic grocery submission waits for initial basket creation',async()=>{
 const app=mount({automatic:true,intent:'groceries',description:'Add 2 apples',emptyBasket:true});try{await app.flush();assert.equal(app.writes.filter(x=>x.table==='grocery_lists').length,1);assert.equal(app.writes.filter(x=>x.table==='grocery_items').length,1)}finally{app.close()}
});
