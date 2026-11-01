import test from 'node:test';
import assert from 'node:assert/strict';
import {startCalendarRefresh} from '../src/lib/calendarRefresh.ts';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){
 const window=new EventTarget(),document=new EventTarget(),navigator={onLine:true};document.hidden=false;
 let timer,cleared=false;window.setInterval=(run,ms)=>{assert.equal(ms,60000);timer=run;return 1};window.clearInterval=()=>{cleared=true};
 return {environment:{window,document,navigator},timer:()=>timer(),cleared:()=>cleared};
}
test('refreshes initially, every minute, and on wake or network reconnection; cleans up',async()=>{
 const e=setup();let calls=0;const stop=startCalendarRefresh(async()=>{calls++},e.environment);
 await tick();assert.equal(calls,1);e.timer();await tick();assert.equal(calls,2);
 for(const name of ['focus','pageshow','online']){e.environment.window.dispatchEvent(new Event(name));await tick()}
 assert.equal(calls,5);e.environment.document.dispatchEvent(new Event('visibilitychange'));await tick();assert.equal(calls,6);
 stop();e.timer();e.environment.window.dispatchEvent(new Event('online'));await tick();assert.equal(calls,6);assert(e.cleared());
});
test('hidden and offline pages wait until visible and online',async()=>{
 const e=setup();e.environment.document.hidden=true;let calls=0;
 const stop=startCalendarRefresh(async()=>{calls++},e.environment);await tick();assert.equal(calls,0);
 e.environment.document.hidden=false;e.environment.navigator.onLine=false;e.timer();await tick();assert.equal(calls,0);
 e.environment.navigator.onLine=true;e.environment.window.dispatchEvent(new Event('online'));await tick();assert.equal(calls,1);stop();
});
test('coalesces simultaneous triggers and recovers after a failed refresh',async()=>{
 const e=setup();let release,calls=0;
 const stop=startCalendarRefresh(()=>{calls++;return new Promise((resolve,reject)=>{release=()=>reject(Error('offline'))})},e.environment);
 await tick();e.timer();e.environment.window.dispatchEvent(new Event('focus'));await tick();assert.equal(calls,1);
 release();await tick();e.timer();await tick();assert.equal(calls,2);release();await tick();stop();
});
