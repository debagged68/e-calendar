import type {Session} from 'basketeer';
import {SecretsManagerClient,GetSecretValueCommand,PutSecretValueCommand} from '@aws-sdk/client-secrets-manager';
import {validateTescoSession,isSessionHandoffId} from '../tesco-session-validation.mjs';

type SessionEnvironment=Record<string,string|undefined>;
function secretLocation(env:SessionEnvironment){return {region:env.AWS_REGION||'eu-north-1',secretId:env.TESCO_SECRET_ID||'e-calendar/tesco-session'}}
export function parseTescoSession(value:string):Session{
 let session:unknown;
 try{session=JSON.parse(value)}catch{throw Error('INVALID_SESSION')}
 return validateTescoSession(session) as Session;
}
export async function loadTescoSession(
 env:SessionEnvironment=process.env,
 readSecret=(region:string,secretId:string)=>new SecretsManagerClient({region}).send(new GetSecretValueCommand({SecretId:secretId}))
):Promise<Session>{
 if(env.TESCO_SESSION_B64)return parseTescoSession(Buffer.from(env.TESCO_SESSION_B64,'base64').toString('utf8'));
 const {region,secretId}=secretLocation(env),secret=await readSecret(region,secretId);
 const value=secret.SecretString||(secret.SecretBinary?Buffer.from(secret.SecretBinary).toString('utf8'):null);
 if(!value)throw Error('NOT_CONFIGURED');
 return parseTescoSession(value);
}
export async function saveTescoSession(session:Session,requestId:string,env:SessionEnvironment=process.env,
 writeSecret=(region:string,input:{SecretId:string;SecretString:string;ClientRequestToken:string})=>new SecretsManagerClient({region}).send(new PutSecretValueCommand(input))){
 if(env.TESCO_SESSION_B64)throw Error('SESSION_OVERRIDE');
 if(!isSessionHandoffId(requestId))throw Error('INVALID_REQUEST');
 const value=JSON.stringify(validateTescoSession(session));
 if(Buffer.byteLength(value)>65536)throw Error('INVALID_SESSION');
 const {region,secretId}=secretLocation(env);
 await writeSecret(region,{SecretId:secretId,SecretString:value,ClientRequestToken:requestId});
}
