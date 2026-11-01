import {BrowserAuthBackend} from 'basketeer/auth/browser/playwright';
import {interactiveTescoLogin} from './tesco-interactive-login.mjs';
import {validateTescoSession} from '../src/lib/tesco-session-validation.mjs';

// No AWS SDK or AWS credential provider runs on the user's computer.
export async function renewTescoSession({backend=new BrowserAuthBackend(),login=interactiveTescoLogin}={}){
 try{
  // Basketeer 0.1.2 renews its persistent Chrome profile; the old-session argument is unused.
  return validateTescoSession(await backend.refresh());
 }catch{return validateTescoSession(await login())}
}
