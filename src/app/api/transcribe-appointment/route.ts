import {NextRequest,NextResponse} from 'next/server';
import {authenticatedUser} from '../../../lib/server/user';
export const runtime='nodejs';
export async function POST(request:NextRequest){
 try{
  if(!await authenticatedUser(request))return NextResponse.json({error:'Please sign in again.'},{status:401});
  if(Number(request.headers.get('content-length')||0)>9*1024*1024)return NextResponse.json({error:'Recording is too large.'},{status:413});
  const form=await request.formData(),audio=form.get('audio');
  if(!(audio instanceof File)||audio.size<500||audio.size>8*1024*1024)return NextResponse.json({error:'Record a short appointment (up to 60 seconds).'}, {status:400});
  const type=audio.type.toLowerCase();
  if(!/audio\/(mp4|x-m4a|m4a|webm|ogg)/.test(type))return NextResponse.json({error:'Unsupported recording format. Try another browser.'},{status:415});
  const apiKey=process.env.GROQ_API_KEY;
  if(!apiKey)return NextResponse.json({error:'Speech transcription is not configured.'},{status:503});
  const payload=new FormData();payload.append('file',audio,audio.name||'appointment.m4a');payload.append('model','whisper-large-v3-turbo');payload.append('language','en');payload.append('response_format','json');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);
  let response:Response;
  try{response=await fetch('https://api.groq.com/openai/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+apiKey},body:payload,signal:controller.signal})}finally{clearTimeout(timeout)}
  if(!response.ok){console.error('Groq transcription error',response.status);return NextResponse.json({error:response.status===429?'Speech service is busy. Please try again shortly.':'Could not transcribe the recording (HTTP '+response.status+').'}, {status:502})}
  const data=await response.json() as {text?:string};
  return NextResponse.json({text:typeof data.text==='string'?data.text.slice(0,1500):''},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('Transcription failed',e instanceof Error?e.message:e);return NextResponse.json({error:'Could not process the recording. Please try again.'},{status:500})}
}
