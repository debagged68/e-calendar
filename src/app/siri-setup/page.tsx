'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {createClient} from '@supabase/supabase-js';
const db=process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY):null;
export default function SiriSetup(){
 const [ready,setReady]=useState(false),[signedIn,setSignedIn]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{if(!db){setReady(true);return}db.auth.getUser().then(r=>{setSignedIn(!!r.data.user);setReady(true)}).catch(()=>setReady(true))},[]);
 async function copyToken(){
  if(!db)return;
  const {data,error}=await db.auth.getSession();
  if(error||!data.session){setMessage('Sign in to E-Calendar first.');return}
  try{await navigator.clipboard.writeText(data.session.refresh_token);setMessage('Connection token copied. Paste it into your Shortcut setup, and keep it private.')}catch{setMessage('Copy failed. Please allow clipboard access.')}
 }
 return <main style={{minHeight:'100dvh',padding:20,background:'#edf3ed',fontFamily:'Arial,sans-serif',color:'#20392e'}}><section style={{maxWidth:670,margin:'auto',padding:24,borderRadius:18,background:'white'}}><Link href="/add">← Quick Action</Link><h1>Connect Siri to E-Calendar</h1><p>Siri uses your existing E-Calendar sign-in. No separate password or AWS settings.</p>
 {!ready?<p>Checking sign-in…</p>:!signedIn?<p>Please <Link href="/add">sign in to Quick Action</Link>, then return here.</p>:<button onClick={()=>void copyToken()} style={{padding:15,fontSize:18,background:'#24634f',color:'white',border:0,borderRadius:10}}>Copy Siri connection token</button>}
 {message&&<p role="status">{message}</p>}
 <h2>iPhone Shortcut</h2><p>Use the existing Dictate Text action, then:</p>
 <ol><li>Create a Text action containing the connection token you copied (initial setup only). Keep this value private.</li><li>Save that Text to an iCloud Drive file named <code>siri-calendar-token.txt</code> in Shortcuts (overwrite enabled).</li><li>Each time Siri runs, Get File <code>siri-calendar-token.txt</code>, then Get Text from File.</li><li>Use Get Contents of URL with method POST, JSON body containing <code>text</code> (Dictated Text) and <code>refreshToken</code> (file text), URL <code>/api/siri</code> on this site's host.</li><li>Get Dictionary Value <code>refreshToken</code> from the response and overwrite <code>siri-calendar-token.txt</code> with the new value.</li><li>Get Dictionary Value <code>spoken</code> and Speak Text.</li></ol>
 <p><strong>Important:</strong> The connection token is a login credential. Do not share it. The Shortcut must save the replacement token after every request because Supabase rotates refresh tokens.</p>
 <p>When the Shortcut says to sign in again, reopen E-Calendar, sign in, copy a new token here and replace the token file.</p>
 </section></main>
}