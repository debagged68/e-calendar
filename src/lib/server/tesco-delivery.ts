import type {SupabaseClient} from '@supabase/supabase-js';
import {londonDate} from '../appointment-dates';

export async function saveTescoDelivery(db:SupabaseClient,userId:string,delivery:{id:string;title:string;start:string;end:string}){
 const existing=await db.from('family_events').select('id').eq('tesco_order_id',delivery.id).maybeSingle();
 if(existing.error)throw existing.error;
 const payload={title:delivery.title,event_date:londonDate(new Date(delivery.start)),start_at:new Date(delivery.start).toISOString(),end_at:new Date(delivery.end).toISOString(),important:false};
 const result=existing.data
  ?await db.from('family_events').update(payload).eq('id',existing.data.id).select('id').single()
  :await db.from('family_events').insert({...payload,tesco_order_id:delivery.id,created_by:userId}).select('id').single();
 if(result.error)throw result.error;
 return {eventId:result.data.id as string,created:!existing.data};
}
