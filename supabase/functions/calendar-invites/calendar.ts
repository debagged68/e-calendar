export type Invite = {
 event_id:string; recipient:string; created_at:string;
 event_snapshot:{title:string;event_date:string;start_at:string|null;end_at:string|null};
};
const escapeText=(text:string)=>text.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
const utc=(value:string)=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
// RFC 5545 folds at 75 UTF-8 octets, without splitting a code point.
function fold(line:string){const out:string[]=[];let current='';let bytes=0;for(const char of line){const size=new TextEncoder().encode(char).length;if(bytes+size>75){out.push(current);current=' ';bytes=1}current+=char;bytes+=size}out.push(current);return out.join('\r\n')}
export function calendarInvitation(invite:Invite,organizer:string){
 const event=invite.event_snapshot;
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//E-Calendar//Family Calendar//EN','CALSCALE:GREGORIAN','METHOD:REQUEST','BEGIN:VEVENT',
  'UID:family-'+invite.event_id+'@e-calendar','DTSTAMP:'+utc(invite.created_at),'SEQUENCE:0','STATUS:CONFIRMED',
  'SUMMARY:'+escapeText(event.title),'ORGANIZER;CN=Family Calendar:mailto:'+organizer,
  'ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:'+invite.recipient];
 if(event.start_at){const start=new Date(event.start_at);const end=event.end_at?new Date(event.end_at):new Date(start.getTime()+3600000);if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)throw Error('Invalid event time');lines.push('DTSTART:'+utc(start.toISOString()),'DTEND:'+utc(end.toISOString()))}
 else {const date=event.event_date;const next=new Date(date+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);lines.push('DTSTART;VALUE=DATE:'+date.replace(/-/g,''),'DTEND;VALUE=DATE:'+next.toISOString().slice(0,10).replace(/-/g,''))}
 lines.push('END:VEVENT','END:VCALENDAR');return lines.map(fold).join('\r\n')+'\r\n';
}
export function base64Utf8(text:string){return btoa(Array.from(new TextEncoder().encode(text),byte=>String.fromCharCode(byte)).join(''))}

function headerText(value:string){
 const words:string[]=[];let chunk='';let bytes=0;
 for(const char of value.replace(/[\r\n\x00-\x1f\x7f]/g,' ')){
  const size=new TextEncoder().encode(char).length;
  if(bytes+size>30){words.push('=?UTF-8?B?'+base64Utf8(chunk)+'?=');chunk='';bytes=0}
  chunk+=char;bytes+=size;
 }
 if(chunk)words.push('=?UTF-8?B?'+base64Utf8(chunk)+'?=');return words.join('\r\n ');
}
export function invitationMime(invite:Invite,sender:string){
 if(!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(sender)||!/^[-A-Za-z0-9_]+$/.test(invite.event_id)||/[\r\n<>]/.test(invite.recipient))throw Error('Invalid invitation envelope');
 const boundary='family_calendar_'+invite.event_id;
 const content=base64Utf8(calendarInvitation(invite,sender)).match(/.{1,76}/g)?.join('\r\n')||'';
 return ['From: '+sender,'To: '+invite.recipient,'Subject: '+headerText(invite.event_snapshot.title),
  'Date: '+new Date(invite.created_at).toUTCString(),'Message-ID: <family-'+invite.event_id+'@e-calendar>',
  'MIME-Version: 1.0','Content-Type: multipart/mixed; boundary="'+boundary+'"','',
  '--'+boundary,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',
  (base64Utf8('You are invited to '+invite.event_snapshot.title+'. Accept the attached invitation to add it to your calendar.').match(/.{1,76}/g)||[]).join('\r\n'),
  '--'+boundary,'Content-Type: text/calendar; charset=UTF-8; method=REQUEST; name="invitation.ics"',
  'Content-Disposition: attachment; filename="invitation.ics"','Content-Transfer-Encoding: base64','',content,
  '--'+boundary+'--',''].join('\r\n');
}
