'use client';
import {useEffect,useState} from 'react';
import {browserClient} from './browser-client';
import {todoItems,Todo} from './todos';
import {startCalendarRefresh} from './calendarRefresh';
// One subscription/poll lifecycle for both the calendar count and the list screen.
export function useTodos(userId?:string){
 const [items,setItems]=useState<Todo[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{
  setItems([]);setLoading(true);setError('');if(!browserClient||!userId)return;
  const db=browserClient;let active=true,sequence=0;
  async function refresh(){const request=++sequence;try{const rows=await todoItems(db);if(active&&request===sequence){setItems(rows);setError('')}}catch(e){if(active&&request===sequence)setError(e instanceof Error?e.message:'Could not load tasks')}finally{if(active&&request===sequence)setLoading(false)}}
  const stop=startCalendarRefresh(refresh);
  const channel=db.channel('shared-todos').on('postgres_changes',{event:'*',schema:'public',table:'todo_items'},()=>{void refresh()}).subscribe();
  const listener=()=>{void refresh()};window.addEventListener('todos-changed',listener);
  return()=>{active=false;stop();window.removeEventListener('todos-changed',listener);void db.removeChannel(channel)};
 },[userId]);
 return {items,error,loading,refresh:()=>window.dispatchEvent(new Event('todos-changed'))};
}
