#!/usr/bin/env node
// Runs on either user's Mac or Windows laptop. No Tesco credentials are sent to our app.
// Chrome authenticates directly with Tesco; only the resulting session is stored in AWS.
import { SecretsManagerClient, GetSecretValueCommand, PutSecretValueCommand } from '@aws-sdk/client-secrets-manager';

import { BrowserAuthBackend } from 'basketeer/auth/browser/playwright';
import { interactiveTescoLogin } from './tesco-interactive-login.mjs';

const region=process.env.AWS_REGION||'eu-north-1';
const secretId=process.env.TESCO_SECRET_ID||'e-calendar/tesco-session';
const mode=process.argv[2]||'refresh';
if(!['refresh','login'].includes(mode)){console.error('Usage: npm run tesco:connect -- [refresh|login]');process.exitCode=2}
else {
 const aws=new SecretsManagerClient({region});
 try{
  let old=null;
  if(mode==='refresh'){
   try{
    const result=await aws.send(new GetSecretValueCommand({SecretId:secretId}));
    const value=result.SecretString||(result.SecretBinary?Buffer.from(result.SecretBinary).toString('utf8'):null);
    if(value)old=JSON.parse(value);
   }catch(e){
    if(e?.name!=='ResourceNotFoundException')throw e;
   }
  }
  const authBackend=new BrowserAuthBackend();
  let session;
  if(old?.accessToken&&old?.cookies&&old?.customerUuid){
   try{session=await authBackend.refresh(old);console.log('Tesco browser session renewed.')}
   catch(e){console.warn('Renewal unavailable:',e instanceof Error?e.message:String(e));if(!process.stdin.isTTY)throw Error('TESCO_INTERACTIVE_REQUIRED: Tesco needs an interactive sign-in. On this Mac, open Terminal and run: cd ~/e-calendar && AWS_PROFILE=oast-cottage npm run tesco:connect -- login');console.warn('Opening Tesco login.');session=await interactiveTescoLogin()}
  }else{
   console.log('Opening Tesco login in Chrome...');
   session=await interactiveTescoLogin();
  }
  if(!session?.accessToken||!session?.customerUuid||!session?.cookies||!session?.accessTokenExpiry||session.accessTokenExpiry<=Date.now()+30000)throw Error('Tesco did not return a valid fresh session; AWS was not changed.');
  await aws.send(new PutSecretValueCommand({SecretId:secretId,SecretString:JSON.stringify(session)}));
  console.log('AWS Tesco session updated. Expires:',new Date(session.accessTokenExpiry).toLocaleString('en-GB'));
  console.log('Both calendar users can now match products. No basket changes were made.');
 }catch(e){
  const awsExpired=e?.name==='CredentialsProviderError'||/session has expired|resolveLoginCredentials|LoginCredentialsFetcher/i.test(String(e?.message||'')+' '+String(e?.stack||''));
  if(awsExpired){
   console.error('AWS_LOGIN_EXPIRED: Your AWS login has expired. On this Mac run: aws login --profile oast-cottage');
   console.error('Then reconnect Tesco. Tesco credentials are not the problem.');
  }else console.error('Tesco connection failed:',e instanceof Error?e.message:String(e));
  if(e instanceof Error)console.error('Failure location:',e.stack?.split('\n').slice(0,7).join('\n'));
  console.error('AWS secret was not intentionally changed on failure. Check AWS credentials, Chrome and Tesco sign-in.');
  process.exitCode=1;
 }
}
