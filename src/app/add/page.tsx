'use client';
import {useBrowserUser} from '../../lib/use-browser-user';
import {browserClient,accessToken} from '../../lib/browser-client';
import {collectingList,addGroceryEntries} from '../../lib/groceries';
import {useEffect,useRef,useState} from 'react';
const client=browserClient;
type AppointmentDraft={title:string;date:string;time:string;endDate:string;endTime:string;important:boolean};
function plusHour(date:string,time:string){if(!date||!time)return {date:'',time:''};const d=new Date(date+'T'+time+':00');if(Number.isNaN(d.getTime()))return {date:'',time:''};d.setHours(d.getHours()+1);const p=(n:number)=>String(n).padStart(2,'0');return {date:d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()),time:p(d.getHours())+':'+p(d.getMinutes())}}
export default function AddPage(){
 const {user,ready}=useBrowserUser();
 const [automatic,setAutomatic]=useState(false),[incomingReady,setIncomingReady]=useState(false),[groceriesReady,setGroceriesReady]=useState(false);
 const automaticStarted=useRef(false),incomingLoaded=useRef(false),saving=useRef(false);
 function complete(message:string){setMessage(message);try{if(automatic&&'speechSynthesis' in window){window.speechSynthesis.cancel();const voice=new SpeechSynthesisUtterance(message.replace(/^✓\s*/,''));voice.lang='en-GB';window.speechSynthesis.speak(voice)}}catch{/* Audio must never turn a successful save into an apparent failure. */}}
 const [transcribing,setTranscribing]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [mode,setMode]=useState<'quick'|'appointment'>('quick');const [listId,setListId]=useState('');
 const [description,setDescription]=useState(''),[title,setTitle]=useState(''),[date,setDate]=useState(''),[time,setTime]=useState('09:00'),[endDate,setEndDate]=useState(''),[endTime,setEndTime]=useState('10:00'),[important,setImportant]=useState(false),[listening,setListening]=useState(false);
 const recorderRef=useRef<MediaRecorder|null>(null),streamRef=useRef<MediaStream|null>(null),timerRef=useRef<ReturnType<typeof setTimeout>|null>(null),chunksRef=useRef<Blob[]>([]),startingRef=useRef(false);
 function cleanupRecording(){if(timerRef.current){clearTimeout(timerRef.current);timerRef.current=null}streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;recorderRef.current=null;setListening(false)}
 useEffect(()=>()=>{if(timerRef.current)clearTimeout(timerRef.current);try{recorderRef.current?.stop()}catch{}streamRef.current?.getTracks().forEach(t=>t.stop())},[]);
 async function login(){if(!client)return;setBusy(true);setMessage('');const {error}=await client.auth.signInWithPassword({email,password});setBusy(false);if(error)setMessage(error.message)}
 async function transcribe(blob:Blob){if(!client)return;if(blob.size<500){setMessage('No audio was recorded. Please try again.');return}if(blob.size>8*1024*1024){setMessage('Recording is too large. Please try a shorter appointment.');return}setTranscribing(true);setMessage('Converting your speech to text…');try{const token=await accessToken(client);const mime=blob.type.toLowerCase();const ext=mime.includes('mp4')?'m4a':mime.includes('ogg')?'ogg':'webm';const form=new FormData();form.append('audio',blob,'appointment.'+ext);const response=await fetch('/api/transcribe-appointment',{method:'POST',headers:{Authorization:'Bearer '+token},body:form});const result=await response.json() as {text?:string;error?:string};if(!response.ok)throw Error(result.error||'Could not transcribe the recording.');if(!result.text?.trim())throw Error('No speech detected. Please try again.');setDescription(v=>(v.trim()?v.trim()+' ':'')+result.text!.trim());setMessage('Speech captured. Tap Continue to review.');setMode('quick')}catch(e){setMessage(e instanceof Error?e.message:'Speech transcription failed.')}finally{setTranscribing(false)}}
 async function toggleRecording(){if(recorderRef.current?.state==='recording'){recorderRef.current.stop();return}if(startingRef.current||transcribing||busy)return;if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){setMessage('Audio recording is not supported in this browser. Use the keyboard microphone instead.');return}startingRef.current=true;setMessage('');try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});streamRef.current=stream;const preferred=['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'];const mime=preferred.find(t=>MediaRecorder.isTypeSupported(t));const recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);recorderRef.current=recorder;chunksRef.current=[];recorder.ondataavailable=e=>{if(e.data.size)chunksRef.current.push(e.data)};recorder.onerror=()=>{cleanupRecording();setMessage('Microphone recording failed. Please try again.')};recorder.onstop=()=>{const audio=new Blob(chunksRef.current,{type:recorder.mimeType||'audio/mp4'});chunksRef.current=[];cleanupRecording();void transcribe(audio)};recorder.start();setListening(true);setMessage('Recording… speak your event or groceries, then tap Stop Listening.');timerRef.current=setTimeout(()=>{if(recorder.state==='recording')recorder.stop()},60000)}catch(e){cleanupRecording();setMessage(e instanceof Error&&e.name==='NotAllowedError'?'Microphone access was denied. Allow microphone access in Safari settings.':'Could not start recording. Use the keyboard microphone instead.')}finally{startingRef.current=false}}

 async function interpret(){if(!description.trim())return setMessage('Describe your appointment first.');if(!client)return;setBusy(true);setMessage('');try{const token=await accessToken(client);const r=await fetch('/api/interpret-appointment',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({description})});const raw=await r.text();let d:{error?:string;title?:string;date?:string;time?:string;endDate?:string;endTime?:string};try{d=JSON.parse(raw)}catch{throw Error('Could not connect to the appointment assistant. Please try again.')}if(!r.ok)throw Error(d.error||'Unable to interpret appointment');const startDate=d.date||'';const startTime=d.time||'09:00';const defaultEnd=plusHour(startDate,startTime);const draft:AppointmentDraft={title:d.title||'',date:startDate,time:startTime,endDate:d.endDate||defaultEnd.date,endTime:d.endTime||defaultEnd.time,important};setTitle(draft.title);setDate(draft.date);setTime(draft.time);setEndDate(draft.endDate);setEndTime(draft.endTime);setMode('appointment');setMessage('Check the appointment before saving.');return draft}catch(e){setMessage(e instanceof Error?e.message:'Unable to interpret appointment')}finally{setBusy(false)}}
 async function save(draft:AppointmentDraft={title,date,time,endDate,endTime,important}){
  if(!client||!user||saving.current)return false;
  if(!draft.title.trim()||!draft.date||!draft.time||!draft.endDate||!draft.endTime){setMessage('Please enter a title, start date and time, and end date and time.');return false}
  const start=new Date(draft.date+'T'+draft.time+':00'),end=new Date(draft.endDate+'T'+draft.endTime+':00');
  if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<=start){setMessage('End must be after start.');return false}
  saving.current=true;setBusy(true);setMessage('');
  try{
   const {error}=await client.from('family_events').insert({title:draft.title.trim(),event_date:draft.date,start_at:start.toISOString(),end_at:end.toISOString(),important:draft.important,created_by:user.id});
   if(error)throw Error(error.message);
   complete('✓ Appointment added to your family calendar: '+draft.title.trim()+' on '+start.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})+' at '+draft.time+'.');
   setDescription('');setTitle('');setDate('');setTime('09:00');setEndDate('');setEndTime('10:00');setImportant(false);setMode('quick');return true;
  }catch(e){setMessage(e instanceof Error?e.message:'Could not save the appointment.');return false}
  finally{saving.current=false;setBusy(false)}
 }

 async function refreshGroceries(){if(!client||!user)return;try{const list=await collectingList(client);setListId(list?.id||'')}catch(e){setMessage(e instanceof Error?e.message:'Could not load groceries')}}
 useEffect(()=>{setGroceriesReady(false);if(user)void refreshGroceries().finally(()=>setGroceriesReady(true))},[user]);
 useEffect(()=>{
  if(incomingLoaded.current)return;incomingLoaded.current=true;
  const params=new URLSearchParams(window.location.search);
  const incoming=(params.get('text')||params.get('input')||'').trim();
  const run=params.get('autorun')==='1';
  if(incoming){setDescription(incoming);setMode('quick');setMessage(run?'Instruction received. Waiting for sign-in…':'Instruction received. Tap Continue to review before saving.')}

  setAutomatic(run);setIncomingReady(true);
  // Remove the executable URL before processing: refreshing must never replay a write.
  if(run)window.history.replaceState(null,'','/add');
 },[]);
 useEffect(()=>{
  if(!incomingReady||!automatic||!ready||!groceriesReady||!user||busy||transcribing||listening||automaticStarted.current)return;
  automaticStarted.current=true;
  void routeQuick();
 },[incomingReady,automatic,ready,groceriesReady,user,busy,transcribing,listening]);
 const quickRunning=useRef(false);
 async function routeQuick(){
  if(quickRunning.current||busy)return;
  if(!description.trim())return setMessage('Say or type an event or groceries.');
  if(!client)return;
  quickRunning.current=true;setBusy(true);setMessage('Understanding your request…');
  try{
   const token=await accessToken(client,'Please sign in.');
   const response=await fetch('/api/interpret-entry',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({description})});
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'Could not interpret request');
   if(data.intent==='groceries'){
    const entries=data.items as {name:string;quantity:number}[]|undefined;
    if(!Array.isArray(entries)||!entries.length)throw Error('No grocery items identified. Please rephrase.');
    const id=listId||(await collectingList(client))!.id;
    setListId(id);
    const saved=await addGroceryEntries(client,id,entries);
    setDescription('');setMode('quick');
    complete('✓ Added to Shopping Whiteboard: '+saved.map(entry=>(entry.quantity>1?entry.quantity+' × ':'')+entry.name).join(', ')+'.');
    await refreshGroceries();
   }else if(data.intent==='appointment'){
    setMode('appointment');const draft=await interpret();if(automatic&&draft)await save(draft);
   }else setMessage('Is this an event or groceries? Please rephrase your request.');
  }catch(e){setMessage(e instanceof Error?e.message:'Could not interpret request')}
  finally{quickRunning.current=false;setBusy(false);setAutomatic(false)}
 }
 const styles={page:{minHeight:'100dvh',background:'#edf3ed',padding:'24px 16px',fontFamily:'Arial, sans-serif',color:'#20392e'},card:{maxWidth:560,margin:'0 auto',padding:24,background:'#fff',borderRadius:20,boxShadow:'0 4px 20px #173c2914'},input:{width:'100%',boxSizing:'border-box' as const,fontSize:20,padding:15,border:'2px solid #b6c8ba',borderRadius:12,marginTop:8,marginBottom:17},button:{width:'100%',minHeight:58,fontSize:19,fontWeight:700 as const,border:0,borderRadius:12,cursor:'pointer',marginTop:10},label:{fontSize:17,fontWeight:700 as const}};
 return <main className="quick-action-page" style={styles.page}><div className="quick-action-card" style={styles.card}><h1 style={{fontSize:30,marginBottom:8}}>Quick Action</h1><p className="quick-action-intro" style={{fontSize:17,lineHeight:1.5}}>Speak or type an event or grocery item. Groceries are added immediately; events are shown for review.</p>
 {!ready?<p>Checking sign-in…</p>:!client?<p>Calendar configuration unavailable.</p>:!user?<form onSubmit={e=>{e.preventDefault();void login()}}><h2>Sign in</h2><label style={styles.label}>Email<input style={styles.input} type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label style={styles.label}>Password<input style={styles.input} type="password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><button style={{...styles.button,background:'#24634f',color:'white'}} disabled={busy}>Sign in</button></form>:<>

 {<><label style={styles.label} htmlFor="description">What would you like to add?</label><textarea id="description" rows={3} className="quick-action-description" style={{...styles.input,resize:'vertical'}} placeholder="e.g. Dentist Thursday at 10, or add 2 milk and eggs" value={description} onChange={e=>setDescription(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();if(!busy&&!transcribing&&!listening&&description.trim())void routeQuick()}}}/>
 <button type="button" style={{...styles.button,background:listening?'#f8d9d9':'#e4eee6',color:'#194a37'}} onClick={()=>void toggleRecording()} disabled={busy||transcribing}>{listening?'■ Stop Listening':transcribing?'Converting speech…':'🎤 Listen'}</button>
 <p className="quick-action-hint" style={{fontSize:14,color:'#486456'}}>Tap Listen to record, then Stop Listening to convert your speech into text. You can also use your keyboard microphone.</p>
 <button type="button" style={{...styles.button,background:'#24634f',color:'white'}} onClick={()=>void routeQuick()} disabled={busy||transcribing||listening}>{busy?'Please wait…':'Continue'}</button></>}
 {message&&<p role="status" style={{fontSize:17,lineHeight:1.5,padding:14,background:'#fff2d8',borderRadius:10,marginTop:14}}>{message}</p>}

 {mode==='appointment'&&<section><h2 style={{fontSize:21,marginTop:25}}>Review appointment</h2>
 <label style={styles.label}>What is it?<input style={styles.input} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Appointment title"/></label>
 <label style={styles.label}>Start date<input style={styles.input} type="date" value={date} onChange={e=>{const d=e.target.value;setDate(d);const end=plusHour(d,time);setEndDate(end.date);setEndTime(end.time)}}/></label>
 <label style={styles.label}>Start time<input style={styles.input} type="time" value={time} onChange={e=>{const t=e.target.value;setTime(t);const end=plusHour(date,t);setEndDate(end.date);setEndTime(end.time)}}/></label>
 <label style={styles.label}>End date<input style={styles.input} type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label>
 <label style={styles.label}>End time<input style={styles.input} type="time" value={endTime} onChange={e=>setEndTime(e.target.value)}/></label>
 <p style={{fontSize:14,color:'#486456'}}>End defaults to one hour after the start. You can change it.</p>
 <label style={{...styles.label,display:'flex',alignItems:'center',gap:12}}><input type="checkbox" checked={important} onChange={e=>setImportant(e.target.checked)} style={{width:26,height:26}}/> Important event</label>
 <button type="button" style={{...styles.button,background:'#24634f',color:'white',marginTop:24}} onClick={()=>void save()} disabled={busy}>ADD TO CALENDAR</button>
 </section>}
 </>}

 <div className="quick-action-links" style={{marginTop:24,display:"flex",justifyContent:"center",gap:14,flexWrap:"wrap"}}><a href="/" style={{display:"inline-block",padding:"14px 18px",background:"#e1eee5",borderRadius:12,color:"#194a37",fontWeight:700,textDecoration:"none",marginBottom:10}}>📅 Family Calendar</a><a href="/basket" style={{display:"inline-block",padding:"14px 18px",background:"#e1eee5",borderRadius:12,color:"#194a37",fontWeight:700,textDecoration:"none",marginBottom:10}}>✎ Shopping Whiteboard</a></div>
 </div></main>
}
