import {redirect} from 'next/navigation';

// Transport only: the existing Shortcut URL hands its text to Quick Action.
export default async function SiriPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams;
 const text=typeof params.text==='string'?params.text:'';
 redirect('/add?'+new URLSearchParams({text,autorun:'1'}).toString());
}
