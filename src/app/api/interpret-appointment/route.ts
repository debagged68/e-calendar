import {NextRequest,NextResponse} from 'next/server';
import {authenticatedUser} from '../../../lib/server/user';
import {extractAppointment} from '../../../lib/server/appointment';
export const runtime='nodejs';
export async function POST(request:NextRequest){
 try{
  if(!await authenticatedUser(request))return NextResponse.json({error:'Please sign in again.'},{status:401});
  const {description}=await request.json();
  if(typeof description!=='string'||!description.trim()||description.length>1500)return NextResponse.json({error:'Enter a short appointment description'},{status:400});
  return NextResponse.json(await extractAppointment(description),{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Could not interpret appointment'},{status:502})}
}
