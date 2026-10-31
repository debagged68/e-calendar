import {NextRequest,NextResponse} from 'next/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest){
 const authorization=request.headers.get('authorization');
 if(!authorization?.match(/^Bearer .+$/i))return NextResponse.json({error:'Please sign in.'},{status:401});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 if(!url)return NextResponse.json({error:'Calendar configuration unavailable.'},{status:503});
 try{
  const body=await request.text();if(body.length>16000)return NextResponse.json({error:'Request too large.'},{status:413});
  const result=await fetch(url+'/functions/v1/microsoft-connect',{method:'POST',headers:{Authorization:authorization,'Content-Type':'application/json'},body,cache:'no-store',signal:AbortSignal.timeout(40000)});
  const data=await result.json();return NextResponse.json(data,{status:result.status,headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'Could not reach the Microsoft connection service.'},{status:502})}
}
