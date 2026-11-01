'use client';
import {browserClient,accessToken} from '../../lib/browser-client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
const helper='http://127.0.0.1:47831';
function safeReturnPath(){
 const value=new URLSearchParams(window.location.search).get('returnTo')||'/basket';
 return value.startsWith('/')&&!value.startsWith('//')&&!value.includes('\\')?value:'/basket';
}
export default function TescoReconnect(){
 const [state,setState]=useState<'connecting'|'waiting'|'failed'>('connecting');
 const [error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let cancelled=false,timer:ReturnType<typeof setTimeout>|undefined;
  const controller=new AbortController(),requestId=crypto.randomUUID();
  async function connected(){
   try{const token=await accessToken(browserClient);const result=await fetch('/api/tesco-test?action=basket',{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:controller.signal});return result.ok}catch{return false}
  }
  async function local(path:string){
   const result=await fetch(helper+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId}),signal:controller.signal});
   const data=await result.json();if(!result.ok)throw Error(data.error||'Could not contact the Tesco helper.');return data;
  }
  async function run(){
   if(await connected()){if(!cancelled)window.location.replace(safeReturnPath());return}
   if(cancelled)return;
   try{
    const token=await accessToken(browserClient);
    const preflight=await fetch('/api/tesco-session',{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:controller.signal});
    const configuration=await preflight.json();if(!preflight.ok)throw Error(configuration.error||'The server is not ready to save the Tesco connection.');
    // Refuse the old AWS-dependent helper before asking it to do any work.
    let health;try{const response=await fetch(helper+'/status',{cache:'no-store',signal:controller.signal});health=await response.json()}
    catch{throw Error('Could not contact the Tesco helper. Update and restart the helper on this Mac, then select Try again. No AWS sign-in is needed.')}
    if(health.protocol!==2)throw Error('The old Tesco helper is still running. Update and restart it once to enable reconnecting without an AWS login.');
    await local('/reconnect');if(cancelled)return;setState('waiting');
    const started=Date.now();
    async function poll(){
     if(cancelled)return;
     try{
      const result=await local('/result');if(cancelled)return;
      if(result.status==='failed')throw Error('Tesco could not renew its browser connection. Try again and complete Tesco sign-in in Chrome if prompted. No AWS sign-in is needed.');
      if(result.status==='ready'){
       const token=await accessToken(browserClient);
       const saved=await fetch('/api/tesco-session',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({requestId,session:result.session}),signal:controller.signal});
       const data=await saved.json();if(!saved.ok)throw Error(data.error||'The server could not save the Tesco connection.');
       await local('/complete').catch(()=>{});
       if(await connected()){if(!cancelled)window.location.replace(safeReturnPath());return}
       throw Error('The refreshed session was saved, but Tesco has not confirmed the connection yet. Select Try again.');
      }
      if(Date.now()-started>360000)throw Error('Tesco sign-in timed out. Select Try again.');
      timer=setTimeout(poll,1500);
     }catch(e){if(!cancelled){setState('failed');setError(e instanceof Error?e.message:'Could not reconnect Tesco.')}}
    }
    timer=setTimeout(poll,1000);
   }catch(e){if(!cancelled){setState('failed');setError(e instanceof Error?e.message:'Could not reconnect Tesco.')}}
  }
  void run();return()=>{cancelled=true;controller.abort();if(timer)clearTimeout(timer)};
 },[attempt]);
 function retry(){setError('');setState('connecting');setAttempt(n=>n+1)}
 return <main className="shell"><section className="panel" style={{maxWidth:520,margin:'70px auto',padding:28,textAlign:'center'}}>
  <h1>{state==='failed'?'Tesco connection needs attention':'Connecting to Tesco…'}</h1>
  {state==='connecting'&&<p>Checking your Tesco connection…</p>}
  {state==='waiting'&&<p>Complete Tesco sign-in in Chrome if prompted. The calendar will save the connection automatically. No AWS sign-in is needed.</p>}
  {error&&<p role="status">{error}</p>}
  {state==='failed'&&<button onClick={retry}>Try again</button>}
  <p><Link href={typeof window==='undefined'?'/basket':safeReturnPath()}>Return to Shopping Chalkboard</Link></p>
 </section></main>;
}
