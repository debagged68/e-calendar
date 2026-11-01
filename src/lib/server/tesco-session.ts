import type {Session} from 'basketeer';
import {SecretsManagerClient,GetSecretValueCommand} from '@aws-sdk/client-secrets-manager';

type SessionEnvironment=Record<string,string|undefined>;
export function parseTescoSession(value:string):Session{
 let session:Session;
 try{session=JSON.parse(value)}catch{throw Error('INVALID_SESSION')}
 if(!session||!session.accessToken||!session.customerUuid||!session.cookies)throw Error('INVALID_SESSION');
 if(!Number.isFinite(session.accessTokenExpiry)||!session.accessTokenExpiry||session.accessTokenExpiry<Date.now()+30000)throw Error('EXPIRED');
 return session;
}

export async function loadTescoSession(
 env:SessionEnvironment=process.env,
 readSecret=(region:string,secretId:string)=>new SecretsManagerClient({region}).send(new GetSecretValueCommand({SecretId:secretId}))
):Promise<Session>{
 if(env.TESCO_SESSION_B64)return parseTescoSession(Buffer.from(env.TESCO_SESSION_B64,'base64').toString('utf8'));
 const secret=await readSecret(env.AWS_REGION||'eu-north-1',env.TESCO_SECRET_ID||'e-calendar/tesco-session');
 const value=secret.SecretString||(secret.SecretBinary?Buffer.from(secret.SecretBinary).toString('utf8'):null);
 if(!value)throw Error('NOT_CONFIGURED');
 return parseTescoSession(value);
}

