const weekdays=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const weekdayPattern='sunday|monday|tuesday|wednesday|thursday|friday|saturday';
export function londonDate(now=new Date()){
 return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function isCalendarDate(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T12:00:00Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
function plusDays(date:string,days:number){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
export function relativeAppointmentDate(description:string,today:string){
 if(!isCalendarDate(today))throw Error('Invalid reference date');
 const matches=[...description.matchAll(new RegExp('\\b(next|this|coming)\\s+('+weekdayPattern+')\\b','gi'))];
 // Multiple date references need review rather than choosing an arbitrary weekday.
 if(matches.length>1)throw Error('Please give one start date for this appointment, or enter the dates manually.');
 if(!matches.length)return null;
 const match=matches[0];
 const weekday=weekdays.indexOf(match[2].toLowerCase());
 const current=new Date(today+'T12:00:00Z').getUTCDay();
 let days=(weekday-current+7)%7;
 if(days===0&&match[1].toLowerCase()!=='this')days=7;
 return {date:plusDays(today,days),phrase:match[0]};
}
export function normaliseAppointmentDates(description:string,date:string,endDate:string,today:string){
 const resolved=relativeAppointmentDate(description,today);
 if(!resolved)return {date:isCalendarDate(date)?date:'',endDate:isCalendarDate(endDate)?endDate:''};
 let end=isCalendarDate(endDate)?endDate:'';
 if(end&&isCalendarDate(date)&&date!==resolved.date){
  // Preserve same-day end times and explicit durations if the AI's start-day arithmetic was wrong.
  if(end===date||/\bfor\s+(?:\d+(?:\.\d+)?|one|two|three|four|half an?)\s*(?:minutes?|hours?|days?|weeks?)\b/i.test(description)){
   const days=(Date.parse(resolved.date+'T12:00:00Z')-Date.parse(date+'T12:00:00Z'))/86400000;
   end=plusDays(end,days);
  }else throw Error('The start and end dates need review. Please enter the dates manually.');
 }
 return {date:resolved.date,endDate:end};
}
