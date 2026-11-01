import type {SupabaseClient} from '@supabase/supabase-js';
export type InvitationSettings={default_invite_email:string|null};

// These preferences belong to the signed-in person; RLS enforces that ownership.
export async function readInvitationSettings(db:SupabaseClient,userId:string):Promise<InvitationSettings|null>{
 const result=await db.from('user_settings').select('default_invite_email').eq('user_id',userId).maybeSingle();
 if(result.error)throw Error(result.error.message);
 return result.data;
}
export async function saveInvitationSettings(db:SupabaseClient,userId:string,email:string):Promise<InvitationSettings>{
 const result=await db.from('user_settings').upsert({user_id:userId,default_invite_email:email.trim()||null,updated_at:new Date().toISOString()},{onConflict:'user_id'}).select('default_invite_email').single();
 if(result.error)throw Error(result.error.message);
 return result.data;
}
