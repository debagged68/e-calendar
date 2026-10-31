import {NextRequest,NextResponse} from 'next/server';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 const authorization=request.headers.get('authorization');
 if(!authorization?.match(/^Bearer .+$/i))return NextResponse.json({error:'Please sign in.'},{status:401});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 if(!url)return NextResponse.json({error:'Calendar configuration unavailable.'},{status:503});
 try{
  const result=await fetch(url+'/functions/v1/calendar-invites',{headers:{Authorization:authorization},cache:'no-store',signal:AbortSignal.timeout(15000)});
  return NextResponse.json(await result.json(),{status:result.status,headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'Could not reach the email service.'},{status:502})}
}
