'use client';
import {useEffect,useRef,useState} from 'react';
import {createClient} from '@supabase/supabase-js';
export default function MicrosoftConnectPage(){
 const started=useRef(false);const [message,setMessage]=useState('Completing your Hotmail connection…');
 useEffect(()=>{
  if(started.current)return;started.current=true;
  void(async()=>{
   try{
    const params=new URLSearchParams(window.location.search),state=params.get('state'),code=params.get('code');
    const expected=sessionStorage.getItem('microsoft-connect-state');
    sessionStorage.removeItem('microsoft-connect-state');
    window.history.replaceState({},'',window.location.pathname);
    if(params.get('error'))throw Error('Microsoft sign-in was cancelled or declined.');
    if(!state||!code||state!==expected)throw Error('This sign-in could not be verified. Please start again from Calendar settings.');
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if(!url||!key)throw Error('Calendar configuration unavailable.');
    const client=createClient(url,key);const {data:{session}}=await client.auth.getSession();
    if(!session)throw Error('Please sign in to the family calendar, then connect Hotmail again.');
    const response=await fetch('/api/microsoft-connect',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({action:'finish',state,code})});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Could not connect Hotmail.');
    setMessage('Hotmail connected: '+data.email+'. New family events can now send invitations.');
   }catch(error){setMessage(error instanceof Error?error.message:'Could not connect Hotmail.')}
  })();
 },[]);
 return <main className="shell"><section className="panel" style={{maxWidth:560,margin:'10vh auto',padding:24}}><h1>Hotmail connection</h1><p role="status">{message}</p><a href="/">Return to Family Calendar</a></section></main>;
}
