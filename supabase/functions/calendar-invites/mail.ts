import {calendarInvitation,base64Utf8,type Invite} from './calendar.ts';
export class MailFailure extends Error {
 retryable:boolean; uncertain:boolean;
 constructor(retryable:boolean,uncertain:boolean,message:string){super(message);this.retryable=retryable;this.uncertain=uncertain}
}
export function mailConfiguration(env:(key:string)=>string|undefined){
 const apiKey=env('BREVO_API_KEY')?.trim(),sender=env('CALENDAR_FROM_EMAIL')?.trim();
 if(!apiKey||!sender||!/^[^\s<>@,;:]+@[^\s<>@,;:]+\.[^\s<>@,;:]+$/.test(sender))return null;
 return {apiKey,sender};
}
export async function sendInvitation(invite:Invite,config:{apiKey:string;sender:string},send:typeof fetch=fetch){
 const payload={sender:{email:config.sender,name:'Family Calendar'},to:[{email:invite.recipient}],
  subject:invite.event_snapshot.title.replace(/[\r\n\x00-\x1f\x7f]/g,' ').slice(0,250),
  textContent:'You are invited to '+invite.event_snapshot.title+'. Open invitation.ics to add this event to your calendar.',
  attachment:[{name:'invitation.ics',content:base64Utf8(calendarInvitation(invite,config.sender))}]};
 let response:Response;
 try{response=await send('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':config.apiKey,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)})}
 catch{throw new MailFailure(false,true,'Delivery uncertain. Check Brevo transactional email logs before sending again.')}
 if(response.status!==201){
  if(response.status===429)throw new MailFailure(true,false,'Email service limit reached. Will retry shortly.');
  if(response.status>=500)throw new MailFailure(false,true,'Delivery uncertain. Check Brevo transactional email logs before sending again.');
  throw new MailFailure(false,false,'Email service rejected the invitation ('+response.status+'). Check the API key, verified sender and Brevo account.');
 }
 try{const data=await response.json();if(typeof data.messageId==='string'&&data.messageId)return data.messageId}catch{}
 throw new MailFailure(false,true,'Delivery uncertain. Check Brevo transactional email logs before sending again.');
}
