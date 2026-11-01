import {createClient} from '@supabase/supabase-js';

// Do not import in client components: server authorization must verify the JWT.
export async function authenticatedUser(request:Request){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
 if(!url||!key||!token)return null;
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+token}}});
 const {data:{user},error}=await db.auth.getUser(token);
 return error||!user?null:{db,user};
}
