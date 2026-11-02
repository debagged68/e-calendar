import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),ts=require('typescript');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const {NextRequest}=require('next/server');
const {POST}=require('../src/app/api/interpret-entry/route.ts');
const {POST:extract}=require('../src/app/api/interpret-appointment/route.ts');
const rules=require('../src/lib/entry-rules.ts');
async function withServices(fn){const original=globalThis.fetch,env={...process.env};let calls=[];
 Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:'https://test.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'test',GROQ_API_KEY:'test'});
 globalThis.fetch=async(url,options)=>{if(String(url).includes('/auth/v1/user'))return Response.json({id:'00000000-0000-4000-8000-000000000001'});calls.push(JSON.parse(options.body));return Response.json({choices:[{message:{content:JSON.stringify({title:'Call plumber',date:'2026-11-04',time:'10:00',endDate:'',endTime:'',items:[{name:'milk',quantity:1}]})}}]})};
 try{await fn(calls)}finally{globalThis.fetch=original;process.env=env}}
function request(description){return new NextRequest('https://example.com/api/interpret-entry',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({description})})}
test('only leading Add routes groceries, ahead of date/time detection',()=>withServices(async calls=>{
 for(const phrase of ['Add milk','  ADD milk Wednesday at 10am']){const response=await POST(request(phrase));assert.equal(response.status,200);assert.equal((await response.json()).intent,'groceries')}
 for(const phrase of ['Buy milk','Need bread','Please add milk','Call plumber','Call plumber Wednesday','Call plumber at 10am','Review 2026-11-04','Review 12/03']){const response=await POST(request(phrase));assert.equal((await response.json()).intent,'todo',phrase)}
 assert.equal(calls.length,2,'Incomplete tasks should not need AI');
}));
test('a dated timed request extracts once and returns the draft for review',()=>withServices(async calls=>{
 const response=await POST(request('Call plumber next Wednesday at 10am'));const result=await response.json();assert.equal(result.intent,'appointment');assert.equal(result.appointment.time,'10:00');assert.equal(calls.length,1);
}));
test('AI cannot fill in absent date/time in conversion',()=>withServices(async()=>{
 for(const [phrase,date,time] of [['Call plumber','',''],['Call plumber Wednesday','2026-11-04',''],['Call plumber at 10am','','10:00']]){const response=await extract(request(phrase));const draft=await response.json();assert.equal(draft.date,date);assert.equal(draft.time,time)}
}));
test('date-only numbers do not count as a time; relative and explicit dates are recognised',()=>{
 for(const phrase of ['2026-11-04','12/03','Call Wednesday'])assert.equal(rules.hasTime(phrase),false);
 for(const phrase of ['tomorrow','next Wednesday','in two days','12/03','2026-11-04'])assert.equal(rules.hasDate(phrase),true);
 for(const phrase of ['at ten','10am',"10 o’clock",'at 10','12:30','noon'])assert.equal(rules.hasTime(phrase),true,phrase);
});
