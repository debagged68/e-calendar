#!/usr/bin/env node
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {isSessionHandoffId} from '../src/lib/tesco-session-validation.mjs';
import {renewTescoSession} from './tesco-browser-session.mjs';

const defaultOrigins=['https://main.d39jquc2st3vwk.amplifyapp.com','http://localhost:3000'];
export function createTescoHelper({renew=renewTescoSession,origins=defaultOrigins,now=Date.now}={}){
 const allowed=new Set(origins);let job=null;
 const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin||'',port=server.address()?.port;
  if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host||'')||!allowed.has(origin)){res.writeHead(403);res.end();return}
  const headers={'Access-Control-Allow-Origin':origin,Vary:'Origin','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Private-Network':'true','Cache-Control':'no-store','Content-Type':'application/json'};
  const reply=(body,status=200)=>{res.writeHead(status,headers);res.end(JSON.stringify(body))};
  if(req.method==='OPTIONS'){res.writeHead(204,headers);res.end();return}
  if(job&&job.status!=='running'&&now()-job.updatedAt>120000)job=null;
  if(req.method==='GET'&&req.url==='/status'){reply({protocol:2,status:job?.status||'idle'});return}
  if(req.method!=='POST'||!['/reconnect','/result','/complete'].includes(req.url)||req.headers['content-type']!=='application/json'){reply({error:'Not found'},404);return}
  let raw='';try{for await(const chunk of req){raw+=chunk;if(raw.length>256){reply({error:'Request too large'},413);return}}}catch{return}
  let body;try{body=JSON.parse(raw)}catch{reply({error:'Invalid request'},400);return}
  if(!isSessionHandoffId(body?.requestId)){reply({error:'Invalid handoff identifier'},400);return}
  if(req.url==='/reconnect'){
   if(job?.status==='running'){reply({error:'Another Tesco reconnect is already running. Return to its calendar tab.'},409);return}
   const current=job={requestId:body.requestId,origin,status:'running',session:null,updatedAt:now()};
   reply({started:true,protocol:2},202);
   void Promise.resolve().then(renew).then(session=>{current.session=session;current.status='ready';current.updatedAt=now()}).catch(()=>{current.status='failed';current.updatedAt=now()});
   return;
  }
  if(!job||job.requestId!==body.requestId||job.origin!==origin){reply({error:'This reconnect has expired. Start again.'},403);return}
  if(req.url==='/complete'){job=null;reply({complete:true});return}
  if(job.status!=='ready'){reply({status:job.status});return}
  // Short-lived, nonce-bound handoff to the approved calendar; no credentials in URLs or logs.
  reply({status:'ready',session:job.session});
 });
 return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const port=Number(process.env.TESCO_HELPER_PORT||47831);
 createTescoHelper().listen(port,'127.0.0.1',()=>console.log('Tesco helper v2 listening on http://127.0.0.1:'+port+' — no local AWS login required.'));
}
