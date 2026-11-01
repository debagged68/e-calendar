'use client';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';

// All browser entry points share Supabase's session/refresh ownership.
export const browserClient:SupabaseClient|null=
 process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ?createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY):null;

export async function accessToken(client:SupabaseClient|null=browserClient,message='Please sign in again.'){
 if(!client)throw Error('Calendar configuration unavailable.');
 const {data:{session},error}=await client.auth.getSession();
 if(error||!session)throw Error(message);
 return session.access_token;
}
