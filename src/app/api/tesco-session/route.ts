import {NextRequest,NextResponse} from 'next/server';
import {authenticatedUser} from '../../../lib/server/user';
import {parseTescoSession,saveTescoSession,loadTescoSession} from '../../../lib/server/tesco-session';
import {isSessionHandoffId} from '../../../lib/tesco-session-validation.mjs';
import {tescoClient} from '../../../lib/server/tesco';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(body:object,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:NextRequest){
 try{
  if(!await authenticatedUser(request))return reply({error:'Please sign in to Family Calendar again.'},401);
  if(process.env.TESCO_SESSION_B64)return reply({error:'Remove TESCO_SESSION_B64 from Amplify to enable the shared session update.'},503);
  try{await loadTescoSession()}catch(e){
   if(!(e instanceof Error)||!['EXPIRED','INVALID_SESSION'].includes(e.message))return reply({error:'The app server could not read the Tesco secret. Check its Amplify compute role and Secrets Manager configuration. No Mac AWS login is needed.'},503);
  }
  return reply({ready:true,awsAccess:'server'});
 }catch{return reply({error:'Could not check the app server connection.'},502)}
}
export async function POST(request:NextRequest){
 try{
  if(!await authenticatedUser(request))return reply({error:'Please sign in to Family Calendar again.'},401);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'Send a JSON session handoff.'},415);
  if(Number(request.headers.get('content-length')||0)>70000)return reply({error:'Session handoff is too large.'},413);
  const raw=await request.text();if(Buffer.byteLength(raw)>70000)return reply({error:'Session handoff is too large.'},413);
  let body;try{body=JSON.parse(raw)}catch{return reply({error:'Invalid session handoff.'},400)}
  if(!isSessionHandoffId(body?.requestId))return reply({error:'Invalid session handoff.'},400);
  if(process.env.TESCO_SESSION_B64)return reply({error:'The app server has a fixed Tesco session override. Remove TESCO_SESSION_B64 from Amplify before saving a refreshed session.'},503);
  let session;try{session=parseTescoSession(JSON.stringify(body.session))}catch{return reply({error:'Tesco did not return a fresh valid session. Please reconnect again.'},422)}
  // Validate with a read only. Never modify the Tesco basket to test a login.
  try{const client=await tescoClient(session);await client.favourites({limit:1})}
  catch{return reply({error:'Tesco could not verify the refreshed connection. Your saved session was not changed.'},422)}
  try{await saveTescoSession(session,body.requestId)}catch{
   return reply({error:'The app server could not save the Tesco session. Its Amplify compute role needs secretsmanager:PutSecretValue for e-calendar/tesco-session. This is a server configuration issue; do not renew the AWS login on your Mac.'},503);
  }
  return reply({saved:true,expiresAt:session.accessTokenExpiry});
 }catch{return reply({error:'Could not complete the Tesco session handoff. Please try again.'},502)}
}
