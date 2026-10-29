'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {createClient} from '@supabase/supabase-js';

const helper='http://127.0.0.1:47831';
const db=process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY):null;
function safeReturnPath(){
 const value=new URLSearchParams(window.location.search).get('returnTo')||'/basket';
 return value.startsWith('/')&&!value.startsWith('//')&&!value.includes('\\')?value:'/basket';
}
export default function TescoReconnect(){
 const [state,setState]=useState<'connecting'|'waiting'|'failed'>('connecting');
 const [error,setError]=useState('');
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let cancelled=false;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const controller=new AbortController();
  let helperStarted=false;
  async function connected(){
   if(!db)return false;
   const {data:{session}}=await db.auth.getSession();
   if(!session)return false;
   try{
    const r=await fetch('/api/tesco-test?action=basket',{headers:{Authorization:'Bearer '+session.access_token},cache:'no-store',signal:controller.signal});
    return r.ok;
   }catch{return false}
  }
  async function check(){
   if(cancelled)return;
   if(await connected()){if(!cancelled)window.location.replace(safeReturnPath());return}
   if(!cancelled)timer=setTimeout(check,2500);
  }
  async function run(){
   // A successful live basket read is the source of truth, not the helper status.
   if(await connected()){if(!cancelled)window.location.replace(safeReturnPath());return}
   if(cancelled)return;
   try{
    const r=await fetch(helper+'/reconnect',{method:'POST',mode:'cors',headers:{'Content-Type':'application/json'},body:'{}',signal:controller.signal});
    if(!r.ok&&r.status!==409)throw Error('Could not start Tesco sign-in.');
    helperStarted=true;
    if(cancelled)return;
    setState('waiting');
   }catch{
    if(cancelled)return;
    setState('waiting');
    setError('Waiting for Tesco to reconnect. If you have already signed in, the page will check automatically.');
   }
   const start=Date.now();
   async function poll(){
    if(cancelled)return;
    if(await connected()){if(!cancelled)window.location.replace(safeReturnPath());return}
    if(cancelled)return;
    if(helperStarted){
     try{
      const r=await fetch(helper+'/status',{signal:controller.signal,cache:'no-store'});
      if(r.ok){
       const data=await r.json() as {status:string};
       if(data.status==='failed'){setState('failed');setError('Tesco sign-in did not complete. Try reconnecting.');return}
      }
     }catch{ /* Old helpers do not provide /status; keep checking Tesco directly. */ }
    }
    if(Date.now()-start>180000){setState('failed');setError('Tesco is not responding yet. You can return to the chalkboard or retry.');return}
    timer=setTimeout(poll,2500);
   }
   timer=setTimeout(poll,1500);
  }
  void run();
  return()=>{cancelled=true;controller.abort();if(timer)clearTimeout(timer)};
 },[attempt]);
 function retry(){setError('');setState('connecting');setAttempt(n=>n+1)}
 return <main className="shell"><section className="panel" style={{maxWidth:520,margin:'70px auto',padding:28,textAlign:'center'}}>
  <h1>{state==='failed'?'Tesco connection needs attention':'Connecting to Tesco…'}</h1>
  {state==='connecting'&&<p>Checking your Tesco connection…</p>}
  {state==='waiting'&&<p>Complete Tesco sign-in if prompted. This page will close automatically as soon as Tesco responds.</p>}
  {error&&<p role="status">{error}</p>}
  {state==='failed'&&<button onClick={retry}>Try again</button>}
  <p><Link href={typeof window==='undefined'?'/basket':safeReturnPath()}>Return to Shopping Chalkboard</Link></p>
 </section></main>;
}
