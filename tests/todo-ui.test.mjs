import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),ts=require('typescript'),Module=require('node:module');
require.extensions['.ts']=require.extensions['.tsx']=(module,filename)=>module._compile(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);
require.extensions['.css']=()=>{};
function text(n){if(n==null||typeof n==='boolean')return '';if(typeof n!=='object')return String(n);return Array.isArray(n)?n.map(text).join(''):text(n.props?.children)}
function find(n,p){if(!n||typeof n!=='object')return null;if(Array.isArray(n)){for(const c of n){const r=find(c,p);if(r)return r}return null}return p(n)?n:find(n.props?.children,p)}
function mount(){
 let rows=[{id:'task-1',title:'Call plumber',due_date:null,created_at:'2026-11-01',completed_at:null,event_id:null}],tree,hook=0,dirty=true;const slots=[],writes=[];
 const react={useState(initial){const i=hook++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;dirty=true}]},useRef(initial){const i=hook++;return slots[i]??(slots[i]={current:initial})}};
 const db={from(table){assert.equal(table,'todo_items');let action,payload,id,onlyUnconverted=false;const q={insert(p){action='insert';payload=p;return q},update(p){action='update';payload=p;return q},delete(){action='delete';return q},eq(_key,value){id=value;return q},is(){onlyUnconverted=true;return q},select(){return q},single(){return q},then(resolve,reject){return Promise.resolve().then(()=>{writes.push({action,payload,id});if(action==='insert')rows.push({id:'task-2',...payload,completed_at:null,event_id:null,created_at:'2026-11-02'});if(action==='update'){const row=rows.find(r=>r.id===id&&(!onlyUnconverted||!r.event_id));if(!row)return {error:{message:'Task changed'}};Object.assign(row,payload)}if(action==='delete')rows=rows.filter(r=>r.id!==id);return {data:{id},error:null}}).then(resolve,reject)}};return q}};
 const load=Module._load;Module._load=function(name,...args){if(name==='react')return react;if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};if(name.includes('use-browser-user'))return {useBrowserUser:()=>({user:{id:'owner'},ready:true})};if(name.includes('browser-client'))return {browserClient:db};if(name.includes('use-todos'))return {useTodos:()=>({items:rows,error:'',loading:false,refresh(){dirty=true}})};return load.call(this,name,...args)};
 let Component;try{delete require.cache[require.resolve('../src/app/todo/page.tsx')];Component=require('../src/app/todo/page.tsx').default}finally{Module._load=load}
 async function flush(){for(let i=0;i<10;i++){if(dirty){dirty=false;hook=0;tree=Component()}await new Promise(resolve=>setImmediate(resolve))}}
 return {flush,writes,get tree(){return tree},get rows(){return rows},async click(label){const b=find(tree,n=>n.type==='button'&&(n.props['aria-label']===label||text(n)===label));assert.ok(b,'Missing '+label);b.props.onClick();await flush()},async enter(value){find(tree,n=>n.type==='input'&&n.props.placeholder==='What needs doing?').props.onChange({target:{value}});await flush()},async submit(){find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}});await flush()}};
}
test('task completion shows a big green tick, removes active count and Undo reopens it',async()=>{
 const app=mount();await app.flush();assert.equal(text(find(app.tree,n=>n.type==='h1')),'To-do list 1');await app.click('Complete Call plumber');assert.equal(text(find(app.tree,n=>n.type==='h1')),'To-do list 0');assert.ok(find(app.tree,n=>n.props?.className==='big-tick'));assert.equal(find(app.tree,n=>n.type==='li').props.className,'todo-row done');assert.match(text(app.tree),/Completed \(1\)/);await app.click('Undo');assert.equal(app.rows[0].completed_at,null);assert.equal(text(find(app.tree,n=>n.type==='h1')),'To-do list 1');assert.equal(app.writes.length,2);
});
test('manual task creation uses the shared task service and conversion link carries only its ID',async()=>{
 const app=mount();await app.flush();await app.enter('Fix garden gate');await app.submit();assert.deepEqual(app.writes[0].payload,{title:'Fix garden gate',created_by:'owner',due_date:null});assert.equal(text(find(app.tree,n=>n.type==='h1')),'To-do list 2');const link=find(app.tree,n=>n.type==='a'&&text(n)==='Convert to calendar event');assert.equal(link.props.href,'/add?task=task-1');
});
