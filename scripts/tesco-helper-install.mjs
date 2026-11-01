// Installation checks only. Tesco authentication remains in tesco-browser-session.mjs.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
const exec=promisify(execFile),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const port=47831,origin='https://main.d39jquc2st3vwk.amplifyapp.com';
async function listeners(){
 try{const result=await exec('/usr/sbin/lsof',['-nP','-t','-iTCP:'+port,'-sTCP:LISTEN']);return [...new Set(result.stdout.trim().split(/\s+/).filter(Boolean).map(Number))]}
 catch(e){if(e.code===1)return [];throw Error('Could not inspect the Tesco helper port. '+e.message)}
}
async function describe(pid){
 const result=await exec('/bin/ps',['-ww','-p',String(pid),'-o','uid=','-o','args=']);
 const match=result.stdout.trim().match(/^(\d+)\s+([\s\S]+)$/);
 return match?{uid:Number(match[1]),command:match[2].trim()}:null;
}
export async function clearOldHelper({find=listeners,inspect=describe,stop=pid=>process.kill(pid,'SIGTERM'),wait=pause,uid=process.getuid()}={}){
 for(const pid of await find()){
  if(!Number.isSafeInteger(pid)||pid<=1)throw Error('Unrecognised process on the Tesco helper port; nothing was stopped.');
  const owner=await inspect(pid);
  if(!owner||owner.uid!==uid||!/(?:^|[\s/])scripts\/tesco-local-helper\.mjs$/.test(owner.command))
   throw Error('Port '+port+' is owned by an unrecognised process (PID '+pid+'). Nothing was stopped.');
  try{stop(pid)}catch(e){if(e.code!=='ESRCH')throw e}
 }
 for(let attempt=0;attempt<20;attempt++){
  if(!(await find()).length)return;
  await wait(250);
 }
 throw Error('The old Tesco helper keeps returning on port '+port+'. Another startup service may be restarting it.');
}
export async function verifyHelper({request=fetch,wait=pause}={}){
 for(let attempt=0;attempt<15;attempt++){
  try{
   const response=await request('http://127.0.0.1:'+port+'/status',{headers:{Origin:origin},cache:'no-store',signal:AbortSignal.timeout(1000)});
   if(response.ok){const result=await response.json();if(result.protocol===2)return}
  }catch{/* Allow launchd time to start the process. */}
  await wait(500);
 }
 throw Error('Helper version 2 did not start. Check ~/Library/Logs/e-calendar/tesco-helper-error.log.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv[2]==='stop'){await clearOldHelper();console.log('Tesco helper port is clear.')}
  else if(process.argv[2]==='verify'){await verifyHelper();console.log('Verified Tesco helper v2 — no local AWS login required.')}
  else throw Error('Use stop or verify.');
 }catch(e){console.error(e.message);process.exitCode=1}
}
