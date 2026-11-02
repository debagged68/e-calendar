import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),ts=require('typescript'),Module=require('node:module');
require.extensions['.ts']=require.extensions['.tsx']=(module,filename)=>module._compile(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);
function text(node){if(node==null||typeof node==='boolean')return '';if(typeof node!=='object')return String(node);return Array.isArray(node)?node.map(text).join(''):text(node.props?.children)}
function find(node,test){if(!node||typeof node!=='object')return null;if(Array.isArray(node)){for(const n of node){const hit=find(n,test);if(hit)return hit}return null}return test(node)?node:find(node.props?.children,test)}
function mount(initial='owner'){
 const previous={fetch:globalThis.fetch,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval,window:globalThis.window};
 const preferences=new Map([['owner',{default_invite_email:'owner@example.com'}]]),writes=[],slots=[],effects=[],cleanups=new Map();
 let user={id:initial,email:initial+'@example.com'},hook=0,dirty=true,tree;
 globalThis.window={location:{search:''}};
 globalThis.setInterval=()=>0;globalThis.clearInterval=()=>{};
 globalThis.fetch=async()=>Response.json({configured:true,calendars:[],events:[],quote:{text:'Test quote',author:'Test author'},news:null});
 const react={useState(initial){const index=hook++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return [slots[index],value=>{const next=typeof value==='function'?value(slots[index]):value;if(!Object.is(next,slots[index])){slots[index]=next;dirty=true}}]},useRef(initial){const index=hook++;return slots[index]??(slots[index]={current:initial})},useMemo(fn){hook++;return fn()},useEffect(effect,deps){const index=hook++;const old=slots[index];if(!old||deps.some((d,i)=>!Object.is(d,old[i]))){slots[index]=deps;effects.push(()=>{cleanups.get(index)?.();cleanups.set(index,effect())})}}};
 const db={from(table){const query={filters:{},write:false,payload:null};const chain={select(){return chain},eq(k,v){query.filters[k]=v;return chain},order(){return chain},limit(){return chain},single(){return chain},maybeSingle(){return chain},upsert(payload){query.write=true;query.payload=payload;return chain},then(resolve,reject){return Promise.resolve().then(()=>{
  if(table==='user_settings'){
   if(query.write){preferences.set(query.payload.user_id,{default_invite_email:query.payload.default_invite_email});writes.push(query.payload);return {data:preferences.get(query.payload.user_id),error:null}}
   return {data:preferences.get(query.filters.user_id)||null,error:null};
  }
  return {data:table==='family_settings'?{photo_path:null}:[],error:null};
 }).then(resolve,reject)}};return chain},channel(){const channel={on(){return channel},subscribe(){return channel}};return channel},removeChannel(){},auth:{getSession:async()=>({data:{session:{access_token:'family-jwt'}}})}};
 const oldEnv={url:process.env.NEXT_PUBLIC_SUPABASE_URL,key:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY};process.env.NEXT_PUBLIC_SUPABASE_URL='https://test.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='test-key';
 const originalLoad=Module._load;
 Module._load=function(name,...args){if(name==='react')return react;if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};if(name.includes('use-browser-user'))return {useBrowserUser:()=>({user,ready:true})};if(name==='@supabase/supabase-js')return {createClient:()=>db};if(name.includes('use-todos'))return {useTodos:()=>({items:[],loading:false,error:''})};if(name==='@/lib/calendarRefresh')return {startCalendarRefresh:()=>()=>{}};return originalLoad.call(this,name,...args)};
 let Component;try{for(const f of ['../src/app/page.tsx','../src/lib/browser-client.ts'])delete require.cache[require.resolve(f)];Component=require('../src/app/page.tsx').default}finally{Module._load=originalLoad}
 async function flush(){let idle=0;for(let i=0;i<30;i++){if(dirty){hook=0;dirty=false;tree=Component();for(const effect of effects.splice(0))effect()}await new Promise(resolve=>setImmediate(resolve));if(!dirty&&!effects.length){if(++idle===2)return}else idle=0}throw Error('UI did not settle')}
 return {preferences,writes,flush,get tree(){return tree},async click(label){const button=find(tree,n=>n.type==='button'&&text(n)===label);assert.ok(button,'Missing '+label);button.props.onClick();await flush()},async save(email){const input=find(tree,n=>n.type==='input'&&n.props.placeholder==='e.g. yourname@hotmail.com');assert.ok(input);input.props.onChange({target:{value:email}});await flush();const form=find(tree,n=>n.type==='form'&&text(n).includes('Save my invitation email'));await form.props.onSubmit({preventDefault(){}});await flush()},async switchUser(id){user={id,email:id+'@example.com'};dirty=true;await flush()},close(){for(const cleanup of cleanups.values())cleanup?.();Object.assign(globalThis,previous);for(const [key,value] of Object.entries({NEXT_PUBLIC_SUPABASE_URL:oldEnv.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:oldEnv.key})){if(value===undefined)delete process.env[key];else process.env[key]=value}}};
}
test('first login opens personal setup and saving her email preserves the existing user’s recipient',async()=>{
 const app=mount('new-person');try{await app.flush();assert.match(text(app.tree),/First-time setup/);await app.save('her-calendar@example.com');assert.equal(app.preferences.get('new-person').default_invite_email,'her-calendar@example.com');assert.equal(app.preferences.get('owner').default_invite_email,'owner@example.com');assert.equal(app.writes[0].user_id,'new-person');assert.match(text(app.tree),/New events you create/)}finally{app.close()}
});
test('existing account keeps its recipient and switching logins does not reuse it',async()=>{
 const app=mount();try{await app.flush();assert.ok(!text(app.tree).includes('First-time setup'));await app.click('⚙ Settings');assert.equal(find(app.tree,n=>n.type==='input'&&n.props.placeholder==='e.g. yourname@hotmail.com').props.value,'owner@example.com');await app.switchUser('new-person');assert.match(text(app.tree),/Signed in as new-person@example.com/);assert.equal(find(app.tree,n=>n.type==='input'&&n.props.placeholder==='e.g. yourname@hotmail.com').props.value,'');}finally{app.close()}
});
