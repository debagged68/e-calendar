#!/usr/bin/env node
// Local-only companion. Never exposes session data or AWS credentials to the website.
import http from 'node:http';
import {spawn} from 'node:child_process';
const port=Number(process.env.TESCO_HELPER_PORT||47831);
const allowed=new Set(['https://main.d39jquc2st3vwk.amplifyapp.com','http://localhost:3000']);
let running=false;
let lastResult='idle';
let lastError=null;
function publicError(output){
 if(output.includes('AWS_LOGIN_EXPIRED:'))return 'aws-login-expired';
 if(output.includes('TESCO_INTERACTIVE_REQUIRED:'))return 'tesco-interactive-required';
 return 'unknown';
}
const server=http.createServer((req,res)=>{
 const origin=req.headers.origin||'';
 const host=req.headers.host||'';
 if(!['127.0.0.1:'+port,'localhost:'+port].includes(host)||!allowed.has(origin)){
  res.writeHead(403);res.end();return;
 }
 res.setHeader('Access-Control-Allow-Origin',origin);
 res.setHeader('Vary','Origin');
 res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
 res.setHeader('Access-Control-Allow-Headers','Content-Type');
 res.setHeader('Access-Control-Allow-Private-Network','true');
 res.setHeader('Cache-Control','no-store');
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
 if(req.method==='GET'&&req.url==='/status'){res.setHeader('Content-Type','application/json');res.writeHead(200);res.end(JSON.stringify({status:running?'running':lastResult,error:lastError}));return;}
 if(req.method!=='POST'||req.url!=='/reconnect'||req.headers['content-type']!=='application/json'){
  res.writeHead(404);res.end();return;
 }
 // Request must be made by the approved calendar origin, with an empty JSON object.
 let body='';req.on('data',chunk=>{body+=chunk;if(body.length>100)req.destroy()});
 req.on('end',()=>{
  if(body!=='{}'){res.writeHead(400);res.end();return;}
  res.setHeader('Content-Type','application/json');
  if(running){res.writeHead(409);res.end(JSON.stringify({error:'Reconnection is already running on this computer.'}));return;}
  running=true;lastResult='running';lastError=null;
  const child=spawn(process.execPath,['scripts/tesco-connect.mjs','refresh'],{cwd:process.cwd(),env:process.env,stdio:['ignore','pipe','pipe']});
  let diagnostic='';
  for(const stream of [child.stdout,child.stderr])stream?.on('data',chunk=>{
   const line=String(chunk);
   diagnostic=(diagnostic+line).slice(-12000);
   // Local logs only; the browser receives an error category, never credentials or session data.
   process.stdout.write(line);
  });
  child.once('error',e=>{running=false;lastResult='failed';lastError='unknown';console.error('Cannot launch Tesco helper:',e.message)});
  child.once('exit',code=>{running=false;lastResult=code===0?'success':'failed';lastError=code===0?null:publicError(diagnostic);console.log('Tesco reconnect finished with exit code',code)});
  res.writeHead(202);res.end(JSON.stringify({started:true,message:'Tesco browser reconnection started on this computer. Follow Chrome and terminal prompts; refresh product matches when complete.'}));
 });
});
server.listen(port,'127.0.0.1',()=>console.log('Tesco local helper listening on http://127.0.0.1:'+port+' (only approved calendar origins). Keep this running for one-click reconnect.'));
