'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';

const helper='http://127.0.0.1:47831';
function safeReturnPath(){
 const value=new URLSearchParams(window.location.search).get('returnTo')||'/basket';
 return value.startsWith('/')&&!value.startsWith('//')&&!value.includes('\\')?value:'/basket';
}
export default function TescoReconnect(){
 const [state,setState]=useState<'connecting'|'waiting'|'failed'>('connecting');
 const [error,setError]=useState('');
 const [attempt,setAttempt]=useState(0);
 const started=useRef(false);
 useEffect(()=>{
  if(started.current)return;
  started.current=true;
  let cancelled=false;
  let pollTimer:ReturnType<typeof setTimeout>|undefined;
  const controller=new AbortController();
  async function run(){
   try{
    const response=await fetch(helper+'/reconnect',{method:'POST',mode:'cors',headers:{'Content-Type':'application/json'},body:'{}',signal:controller.signal});
    if(!response.ok){
     if(response.status!==409)throw Error('Unable to start Tesco sign-in.');
    }
    if(cancelled)return;
    setState('waiting');
    const startedAt=Date.now();
    async function check(){
     if(cancelled)return;
     try{
      const r=await fetch(helper+'/status',{signal:controller.signal,cache:'no-store'});
      if(!r.ok)throw Error('Cannot check connection progress.');
      const data=await r.json() as {status:string};
      if(cancelled)return;
      if(data.status==='success'){window.location.replace(safeReturnPath());return;}
      if(data.status==='failed')throw Error('Tesco sign-in was not completed. Please retry.');
      if(Date.now()-startedAt>180000)throw Error('Tesco sign-in is taking longer than expected. Please check Chrome, then retry.');
      pollTimer=setTimeout(check,1500);
     }catch(e){if(!cancelled){setError(e instanceof Error?e.message:'Connection failed.');setState('failed');}}
    }
    pollTimer=setTimeout(check,1000);
   }catch(e){if(!cancelled){setError(e instanceof Error?e.message:'Could not reach the Tesco helper on this computer.');setState('failed');}}
  }
  void run();
  return()=>{cancelled=true;controller.abort();if(pollTimer)clearTimeout(pollTimer)};
 },[attempt]);
 function retry(){started.current=false;setError('');setState('connecting');setAttempt(n=>n+1);}
 return <main className="shell"><section className="panel" style={{maxWidth:520,margin:'70px auto',padding:28,textAlign:'center'}}>
  <h1>{state==='failed'?'Tesco connection needs attention':'Connecting to Tesco…'}</h1>
  {state==='connecting'&&<p>Starting Tesco sign-in…</p>}
  {state==='waiting'&&<p>Complete Tesco sign-in in Chrome if prompted. You will return automatically to your previous page once connected.</p>}
  {state==='failed'&&<><p role="alert">{error}</p><p>Check that the Tesco helper is running on this computer, and complete any Chrome sign-in prompts.</p><button onClick={retry}>Retry connection</button></>}
  <p><Link href="/basket">Return to Add to Basket</Link></p>
 </section></main>;
}
