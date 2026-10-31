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
