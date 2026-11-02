import type {SupabaseClient} from '@supabase/supabase-js';
export type Todo={id:string;title:string;due_date:string|null;completed_at:string|null;event_id:string|null;created_at:string};
const fields='id,title,due_date,completed_at,event_id,created_at';
export function todoTitle(value:string){const title=value.trim();if(!title||title.length>1500)throw Error('Enter a task between 1 and 1500 characters.');return title}
export async function todoItems(db:SupabaseClient){const {data,error}=await db.from('todo_items').select(fields).order('created_at');if(error)throw Error(error.message);return (data||[]) as Todo[]}
export async function readTodo(db:SupabaseClient,id:string){const {data,error}=await db.from('todo_items').select(fields).eq('id',id).single();if(error)throw Error(error.message);return data as Todo}
export async function addTodo(db:SupabaseClient,title:string,userId:string,dueDate:string|null=null){const {error}=await db.from('todo_items').insert({title:todoTitle(title),created_by:userId,due_date:dueDate||null});if(error)throw Error(error.message)}
export async function updateTodo(db:SupabaseClient,id:string,changes:{title?:string;due_date?:string|null;completed_at?:string|null}){const values={...changes};if(values.title!==undefined)values.title=todoTitle(values.title);const {data,error}=await db.from('todo_items').update(values).eq('id',id).is('event_id',null).select('id').single();if(error||!data)throw Error(error?.message||'This task has changed. Refresh and try again.')}
export async function deleteTodo(db:SupabaseClient,id:string){const {error}=await db.from('todo_items').delete().eq('id',id);if(error)throw Error(error.message)}
