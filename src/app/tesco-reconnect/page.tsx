'use client';
import {useState} from 'react';
export default function TescoReconnect(){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function reconnect(){
  setBusy(true);setMessage('');
  try{
   const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),6000);
   let response:Response;
   try{response=await fetch('http://127.0.0.1:47831/reconnect',{method:'POST',mode:'cors',headers:{'Content-Type':'application/json'},body:'{}',signal:controller.signal})}finally{clearTimeout(timer)}
   const data=await response.json() as {message?:string;error?:string};
   if(!response.ok)throw Error(data.error||'Local helper refused the request.');
   setMessage(data.message||'Reconnection started. Follow the Chrome prompts.');
  }catch{
   setMessage('Could not reach the local Tesco helper. Start it once on this computer using the setup command below, then click Reconnect Tesco again. Some browsers may block local-network requests; if so use the manual fallback.');
  }finally{setBusy(false)}
 }
 return <main className="shell"><section className="panel" style={{maxWidth:740,margin:'32px auto',padding:24}}><a href="/">← Back to calendar</a><h1>Reconnect Tesco</h1><p>Your grocery list is safe. This button asks a helper running on <strong>this computer</strong> to open Chrome and refresh the shared Tesco session in AWS Secrets Manager.</p><button disabled={busy} onClick={()=>void reconnect()}>{busy?'Connecting…':'Reconnect Tesco'}</button>{message&&<p role="status">{message}</p>}<h2>One-time computer setup</h2><p>On your Mac, open Terminal in the project folder and start the helper. Leave it running, or configure it to start automatically when you sign in to your computer.</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',padding:12,background:'#f4f4f4',color:'#222'}}>{'cd ~/e-calendar\ngit pull\naws login --profile oast-cottage\nAWS_PROFILE=oast-cottage npm run tesco:helper'}</pre><p>For Windows, configure AWS credentials and run <code>npm run tesco:helper</code> in the project folder. Chrome, Node.js and Playwright are required.</p><h2>Manual fallback</h2><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',padding:12,background:'#f4f4f4',color:'#222'}}>{'AWS_PROFILE=oast-cottage npm run tesco:connect -- refresh'}</pre><p>Once Chrome sign-in completes and AWS reports an updated session, return to the calendar and choose <strong>Refresh matches</strong>. The website never receives your Tesco password, cookies or AWS credentials.</p><p><a href="https://github.com/debagged68/e-calendar/blob/main/docs/tesco-reconnect.md" target="_blank" rel="noopener noreferrer">Detailed setup and troubleshooting</a></p></section></main>;
}
