import test from 'node:test';
import assert from 'node:assert/strict';
import {londonDate,relativeAppointmentDate,normaliseAppointmentDates,isCalendarDate} from '../src/lib/appointment-dates.ts';
test('exact Siri phrase cannot keep a model-generated Wednesday',()=>{
 const text=decodeURIComponent('Run%20test%2074%20next%20Saturday%2010%20o\'clock');
 assert.deepEqual(normaliseAppointmentDates(text,'2026-11-04','','2026-10-31'),{date:'2026-11-07',endDate:''});
});
test('every next weekday resolves to that weekday from all seven reference days',()=>{
 const names=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
 for(let day=1;day<=7;day++)for(let weekday=0;weekday<7;weekday++){
  const today='2026-11-'+String(day).padStart(2,'0');
  const result=relativeAppointmentDate('Dentist next '+names[weekday],today);
  const target=new Date(result.date+'T12:00:00Z');const delta=(target-new Date(today+'T12:00:00Z'))/86400000;
  assert.equal(target.getUTCDay(),weekday);assert.ok(delta>=1&&delta<=7);
 }
});
test('same-day this Saturday and next Saturday remain distinct',()=>{
 assert.equal(relativeAppointmentDate('this Saturday','2026-10-31').date,'2026-10-31');
 assert.equal(relativeAppointmentDate('next Saturday','2026-10-31').date,'2026-11-07');
});
test('month and year rollover and London midnight are handled independently of server timezone',()=>{
 assert.equal(relativeAppointmentDate('next Saturday','2026-12-31').date,'2027-01-02');
 assert.equal(londonDate(new Date('2026-07-01T23:30:00Z')),'2026-07-02');
 assert.equal(londonDate(new Date('2026-10-31T23:30:00Z')),'2026-10-31');
});
test('same-day end time and duration retain their relationship after correcting model date',()=>{
 assert.deepEqual(normaliseAppointmentDates('Run next Saturday','2026-11-04','2026-11-04','2026-10-31'),{date:'2026-11-07',endDate:'2026-11-07'});
 assert.deepEqual(normaliseAppointmentDates('Trip next Saturday for 2 days','2026-11-04','2026-11-06','2026-10-31'),{date:'2026-11-07',endDate:'2026-11-09'});
});
test('invalid dates and conflicting date references cannot silently be saved',()=>{
 assert.equal(isCalendarDate('2026-02-30'),false);
 assert.throws(()=>relativeAppointmentDate('next Saturday or next Wednesday','2026-10-31'));
 assert.throws(()=>normaliseAppointmentDates('next Saturday until 10 November','2026-11-04','2026-11-10','2026-10-31'));
 assert.deepEqual(normaliseAppointmentDates('Dentist 4 November','2026-11-04','','2026-10-31'),{date:'2026-11-04',endDate:''});
});
