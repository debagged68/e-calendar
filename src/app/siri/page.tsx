'use client';
import {useEffect,useRef,useState} from 'react';
import {createClient} from '@supabase/supabase-js';
const db=process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY):null;
export default function SiriPage(){
 const [message,setMessage]=useState('Processing…');
 const once=useRef(false);
 useEffect(()=>{
  if(once.current)return;once.current=true;
  const phrase=new URLSearchParams(location.search).get('text')?.trim()||'';
  history.replaceState(null,'','/siri');
  function respond(s:string){setMessage(s);if('speechSynthesis' in window){speechSynthesis.cancel();const voice=new SpeechSynthesisUtterance(s);voice.lang='en-GB';speechSynthesis.speak(voice)}}
  async function run(){
   if(!phrase||phrase.length>1500)return respond('No valid instruction received.');
   if(!db)return respond('Calendar unavailable.');
   try{
    const {data:{session}}=await db.auth.getSession();
    if(!session)return respond('Not logged in.');
    const r=await fetch('/api/siri',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({text:phrase})});
    const result=await r.json() as {spoken?:string};
    respond(r.status===401?'Not logged in.':result.spoken||'Sorry, that did not work.');
   }catch{respond('Sorry, E-Calendar could not connect.')}
  }
  void run();
 },[]);
 return <main style={{fontFamily:'Arial',padding:30,textAlign:'center'}}><h1>E-Calendar Siri</h1><p role="status" style={{fontSize:24}}>{message}</p><p>Safari may require a tap to enable spoken audio.</p><nav aria-label="Next action" style={{display:"flex",justifyContent:"center",flexWrap:"wrap",gap:12,marginTop:20}}><a href="/basket" style={{display:"inline-block",padding:"14px 18px",borderRadius:12,background:"#24634f",color:"white",fontWeight:700,textDecoration:"none"}}>✎ Shopping Whiteboard</a><a href="/add" style={{display:"inline-block",padding:"14px 18px",borderRadius:12,background:"#e1eee5",color:"#194a37",fontWeight:700,textDecoration:"none"}}>Quick Action</a></nav></main>;
}
