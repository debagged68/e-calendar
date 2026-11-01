import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarInvitation,base64Utf8} from '../supabase/functions/calendar-invites/calendar.ts';
const invite={event_id:'event-123',recipient:'calendar@example.com',created_at:'2026-10-31T12:34:56.000Z',event_snapshot:{title:'Dentist',event_date:'2026-11-02',start_at:null,end_at:null}};
const unfold=text=>text.replace(/\r\n /g,'');
test('date-only events cover exactly one day, including year rollover',()=>{
 const text=unfold(calendarInvitation({...invite,event_snapshot:{...invite.event_snapshot,event_date:'2026-12-31'}},'sender@example.com'));
 assert.match(text,/METHOD:REQUEST\r\n/);assert.match(text,/DTSTART;VALUE=DATE:20261231/);assert.match(text,/DTEND;VALUE=DATE:20270101/);
 assert.match(text,/PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:calendar@example.com/);
});
test('timed invitations preserve UTC instants across the London daylight-saving change',()=>{
 const text=unfold(calendarInvitation({...invite,event_snapshot:{...invite.event_snapshot,start_at:'2026-10-25T00:30:00Z',end_at:'2026-10-25T01:30:00Z'}},'sender@example.com'));
 assert.match(text,/DTSTART:20261025T003000Z/);assert.match(text,/DTEND:20261025T013000Z/);
});
test('titles cannot inject calendar properties and Unicode lines stay within 75 bytes',()=>{
 const title='🛒'.repeat(40)+'; milk, eggs\r\nATTENDEE:evil@example.com';
 const text=calendarInvitation({...invite,event_snapshot:{...invite.event_snapshot,title}},'sender@example.com');
 for(const line of text.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);
 const plain=unfold(text);assert.equal(plain.split('\r\n').filter(line=>line.startsWith('ATTENDEE')).length,1);
 assert.ok(plain.includes('\\; milk\\, eggs\\nATTENDEE:evil@example.com'));
 assert.equal(Buffer.from(base64Utf8(text),'base64').toString('utf8'),text);
});
test('retry payload stays identical and bad end times are rejected',()=>{
 assert.equal(calendarInvitation(invite,'sender@example.com'),calendarInvitation(invite,'sender@example.com'));
 assert.throws(()=>calendarInvitation({...invite,event_snapshot:{...invite.event_snapshot,start_at:'2026-11-02T10:00:00Z',end_at:'2026-11-02T09:00:00Z'}},'sender@example.com'));
});
