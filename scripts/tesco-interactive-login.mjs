// Interactive fallback for Tesco login when Basketeer's one-shot cookie harvest runs too early.
// No credentials or cookie values are logged or persisted locally.
import {createInterface} from 'node:readline/promises';
import {stdin as input,stdout as output} from 'node:process';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {sessionFromCookies} from 'basketeer';

const loginUrl='https://www.tesco.com/account/login';
const groceriesUrl='https://www.tesco.com/groceries/';
const refreshUrl='https://www.tesco.com/account/auth/en-GB/refresh-token?soft-refresh=false&from=https%3A%2F%2Fwww.tesco.com%2Fshop%2Fen-GB%2Flanding%2Fgroceries';
const wait=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
export async function interactiveTescoLogin(){
 if(!input.isTTY)throw Error('Interactive Tesco login requires a Terminal window.');
 const {chromium}=await import('playwright');
 const context=await chromium.launchPersistentContext(join(homedir(),'.basketeer','chrome-profile'),{
  channel:'chrome',headless:false,locale:'en-GB',timezoneId:'Europe/London',
  args:['--disable-blink-features=AutomationControlled','--no-first-run','--no-default-browser-check'],
  ignoreDefaultArgs:['--enable-automation']
 });
 try{
  const page=context.pages()[0]||await context.newPage();
  await page.goto(loginUrl,{waitUntil:'domcontentloaded'});
  const rl=createInterface({input,output});
  try{await rl.question('Sign in to Tesco in Chrome, then press Enter here once the groceries home page appears.\n');}
  finally{rl.close()}
  const harvest=async()=>{
   const cookies=await context.cookies();
   try{return sessionFromCookies(cookies)}
   catch{return null}
  };
  // Tesco may set OAuth cookies only after its groceries redirect or token refresh.
  let session=await harvest();
  if(!session){
   console.log('Tesco login accepted; waiting for the authenticated session cookies…');
   await page.goto(groceriesUrl,{waitUntil:'domcontentloaded',timeout:30000}).catch(()=>{});
   for(let i=0;i<10&&!session;i++){session=await harvest();if(!session)await wait(1000)}
  }
  if(!session){
   console.log('Trying Tesco browser token refresh…');
   await page.goto(refreshUrl,{waitUntil:'domcontentloaded',timeout:30000}).catch(()=>{});
   for(let i=0;i<15&&!session;i++){session=await harvest();if(!session)await wait(1000)}
  }
  if(!session){
   const names=[...new Set((await context.cookies()).map(c=>c.name))];
   console.error('Tesco authentication cookies present:',{oauth:names.includes('OAuth.AccessToken'),uuid:names.includes('UUID')});
   throw Error('Tesco login completed in Chrome, but the required session cookies were not available. No AWS changes were made.');
  }
  return session;
 }finally{await context.close().catch(()=>{})}
}
