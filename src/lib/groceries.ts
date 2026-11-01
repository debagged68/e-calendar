import type {SupabaseClient} from '@supabase/supabase-js';

export type GroceryItem={id:string;name:string;quantity:number;unit:string};
export type GroceryEntry={name:string;quantity:number};
export type GroceryList={id:string;event_id:string|null};

export async function collectingList(db:SupabaseClient,create=true):Promise<GroceryList|null>{
 const result=await db.from('grocery_lists').select('id,event_id').eq('status','collecting').order('created_at',{ascending:true}).limit(1);
 if(result.error)throw Error(result.error.message);
 if(result.data?.[0]||!create)return result.data?.[0]||null;
 const inserted=await db.from('grocery_lists').insert({status:'collecting'}).select('id,event_id').single();
 if(!inserted.error)return inserted.data;
 // The unique collecting-list constraint may have been won by another device.
 if(inserted.error.code==='23505')return collectingList(db,false).then(list=>{
  if(!list)throw Error(inserted.error.message);
  return list;
 });
 throw Error(inserted.error.message);
}

export async function groceryItems(db:SupabaseClient,listId:string):Promise<GroceryItem[]>{
 const result=await db.from('grocery_items').select('id,name,quantity,unit').eq('list_id',listId).order('created_at');
 if(result.error)throw Error(result.error.message);
 return result.data||[];
}

export function groceryEntry(name:string,quantity:number):GroceryEntry{
 const trimmed=name.trim();
 if(!trimmed||trimmed.length>160||!Number.isInteger(quantity)||quantity<1||quantity>999)
  throw Error('Enter an item up to 160 characters and a quantity between 1 and 999.');
 return {name:trimmed,quantity};
}

export function parseGroceryEntry(text:string):GroceryEntry{
 const match=text.trim().match(/^(\d+)\s+(.+)$/);
 return groceryEntry((match?match[2]:text.trim()).replace(/^(add|buy|need)\s+/i,''),match?Number(match[1]):1);
}

// Manual whiteboard and Quick Action use this one case-insensitive merge rule.
// This preserves the current REST workflow; cross-device atomic increments remain separate work.
export async function addGroceryEntries(db:SupabaseClient,listId:string,entries:GroceryEntry[]){
 const validated=entries.map(entry=>groceryEntry(entry.name,Number(entry.quantity)));
 const items=await groceryItems(db,listId);
 const merged=new Map<string,GroceryEntry>();
 for(const entry of validated){
  const key=entry.name.toLowerCase(),previous=merged.get(key);
  merged.set(key,groceryEntry(previous?.name||entry.name,(previous?.quantity||0)+entry.quantity));
 }
 const plan=[...merged.values()].map(entry=>{
  const existing=items.find(item=>item.name.toLowerCase()===entry.name.toLowerCase());
  return {existing,entry:groceryEntry(entry.name,(existing?.quantity||0)+entry.quantity)};
 });
 for(const {existing,entry} of plan){
  const result=existing
   ?await db.from('grocery_items').update({quantity:entry.quantity}).eq('id',existing.id)
   :await db.from('grocery_items').insert({list_id:listId,...entry});
  if(result.error)throw Error(result.error.message);
 }
 return validated;
}
