import {NextResponse} from 'next/server';
export const runtime='nodejs';
export const revalidate=3600;
const quotes=[
{text:'The important thing is not to stop questioning.',author:'Albert Einstein'},
{text:'Look deep into nature, and then you will understand everything better.',author:'Albert Einstein'},
{text:'The journey of a thousand miles begins with a single step.',author:'Lao Tzu'},
{text:'It always seems impossible until it is done.',author:'Nelson Mandela'},
{text:'The more that you read, the more things you will know.',author:'Dr. Seuss'},
{text:'Nothing in life is to be feared, it is only to be understood.',author:'Marie Curie'},
{text:'The earth has music for those who listen.',author:'George Santayana (often attributed)'}
];
function decode(s:string){return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim()}
function field(item:string,tag:string){return item.match(new RegExp('<'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+tag+'>','i'))?.[1]||''}
function ukDate(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
export async function GET(){
 const day=ukDate();const n=Math.floor(Date.parse(day+'T12:00:00Z')/86400000);const quote=quotes[((n%quotes.length)+quotes.length)%quotes.length];
 let news=null;
 try{
  const r=await fetch('https://www.positive.news/feed/',{next:{revalidate:3600},signal:AbortSignal.timeout(8000),headers:{'User-Agent':'FamilyCalendar/1.0'}});
  if(!r.ok)throw new Error('Feed unavailable');
  const xml=await r.text();const items=[...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(m=>m[1]);
  const stories=items.map(item=>({title:decode(field(item,'title')),summary:decode(field(item,'description')).slice(0,260),url:decode(field(item,'link')),published:field(item,'pubDate')})).filter(x=>x.title&&/^https:\/\/www\.positive\.news\//.test(x.url)&&!isNaN(Date.parse(x.published)));
  const recent=stories.filter(x=>{const age=Date.now()-Date.parse(x.published);return age>=0&&age<7*86400000});
  const pool=recent.length?recent:stories;
  const chosen=pool[n%Math.max(1,pool.length)];
  if(chosen)news={title:chosen.title,summary:chosen.summary,url:chosen.url,published:new Date(chosen.published).toISOString().slice(0,10),source:'Positive News'};
 }catch{}
 return NextResponse.json({day,quote,news},{headers:{'Cache-Control':'public, s-maxage=3600, stale-while-revalidate=3600'}});
}
