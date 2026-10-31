-- Private, encrypted OAuth credentials. Only server-side service-role RPCs can use them.
create table calendar_private.microsoft_sender (
 id boolean primary key default true check(id), connected_by uuid not null references auth.users(id) on delete cascade,
 email text not null, access_cipher bytea not null, refresh_cipher bytea not null,
 expires_at timestamptz not null, connected_at timestamptz not null default now()
);
create table calendar_private.microsoft_oauth_states (
 state_hash text primary key, user_id uuid not null references auth.users(id) on delete cascade,
 verifier_cipher bytea not null, redirect_uri text not null, expires_at timestamptz not null
);
revoke all on calendar_private.microsoft_sender,calendar_private.microsoft_oauth_states from public,anon,authenticated;
grant all on calendar_private.microsoft_sender,calendar_private.microsoft_oauth_states to service_role;

create function public.microsoft_sender_read() returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('email',s.email,'connected_by',s.connected_by,'expires_at',s.expires_at,
 'access_token',extensions.pgp_sym_decrypt(s.access_cipher,c.token),'refresh_token',extensions.pgp_sym_decrypt(s.refresh_cipher,c.token))
 from calendar_private.microsoft_sender s cross join calendar_private.worker_config c where s.id and c.id;
$$;
create function public.microsoft_sender_save(owner_id uuid,sender_email text,access_token text,refresh_token text,expires_at timestamptz) returns void
 language sql security invoker set search_path='' as $$
 insert into calendar_private.microsoft_sender(id,connected_by,email,access_cipher,refresh_cipher,expires_at)
 select true,owner_id,sender_email,extensions.pgp_sym_encrypt(access_token,c.token),extensions.pgp_sym_encrypt(refresh_token,c.token),expires_at
 from calendar_private.worker_config c where c.id
 on conflict(id) do update set connected_by=excluded.connected_by,email=excluded.email,access_cipher=excluded.access_cipher,
 refresh_cipher=excluded.refresh_cipher,expires_at=excluded.expires_at
 where calendar_private.microsoft_sender.connected_by=owner_id;
$$;
create function public.microsoft_sender_disconnect(owner_id uuid) returns void language sql security invoker set search_path='' as $$
 delete from calendar_private.microsoft_sender where connected_by=owner_id;
$$;
create function public.microsoft_oauth_start(state_hash text,owner_id uuid,verifier text,redirect_uri text) returns void
 language sql security invoker set search_path='' as $$
 delete from calendar_private.microsoft_oauth_states where expires_at<now() or user_id=owner_id;
 insert into calendar_private.microsoft_oauth_states(state_hash,user_id,verifier_cipher,redirect_uri,expires_at)
 select state_hash,owner_id,extensions.pgp_sym_encrypt(verifier,c.token),redirect_uri,now()+interval '10 minutes'
 from calendar_private.worker_config c where c.id;
$$;
create function public.microsoft_oauth_consume(state_hash text,owner_id uuid) returns jsonb
 language sql security invoker set search_path='' as $$
 with consumed as (delete from calendar_private.microsoft_oauth_states s where s.state_hash=$1 and s.user_id=$2 and s.expires_at>now() returning *)
 select jsonb_build_object('verifier',extensions.pgp_sym_decrypt(s.verifier_cipher,c.token),'redirect_uri',s.redirect_uri)
 from consumed s cross join calendar_private.worker_config c where c.id;
$$;
revoke all on function public.microsoft_sender_read(),public.microsoft_sender_save(uuid,text,text,text,timestamptz),public.microsoft_sender_disconnect(uuid),public.microsoft_oauth_start(text,uuid,text,text),public.microsoft_oauth_consume(text,uuid) from public,anon,authenticated;
grant execute on function public.microsoft_sender_read(),public.microsoft_sender_save(uuid,text,text,text,timestamptz),public.microsoft_sender_disconnect(uuid),public.microsoft_oauth_start(text,uuid,text,text),public.microsoft_oauth_consume(text,uuid) to service_role;

-- Graph sendMail has no idempotency guarantee: never blindly resend an uncertain delivery.
create or replace function public.claim_calendar_invites() returns setof public.calendar_invites
 language plpgsql security invoker set search_path='' as $$
 begin
  update public.calendar_invites set status='failed',attempts=5,last_error='Delivery uncertain. Check Hotmail Sent Items before sending again.'
   where status='sending' and attempted_at<now()-interval '5 minutes';
  return query update public.calendar_invites set status='sending',attempts=attempts+1,attempted_at=now(),first_attempt_at=coalesce(first_attempt_at,now())
   where event_id in (select i.event_id from public.calendar_invites i
    where i.status in ('pending','failed') and i.attempts<5 and (i.attempted_at is null or i.attempted_at<now()-interval '5 minutes')
    order by i.created_at limit 5 for update skip locked)
   returning *;
 end;
$$;

create function public.microsoft_sender_renew(owner_id uuid,old_refresh_token text,access_token text,refresh_token text,expires_at timestamptz) returns boolean
 language sql security invoker set search_path='' as $$
 with updated as (
 update calendar_private.microsoft_sender s set access_cipher=extensions.pgp_sym_encrypt(access_token,c.token),refresh_cipher=extensions.pgp_sym_encrypt(refresh_token,c.token),expires_at=$5
 from calendar_private.worker_config c where c.id and s.id and s.connected_by=owner_id and extensions.pgp_sym_decrypt(s.refresh_cipher,c.token)=old_refresh_token returning s.id
 ) select exists(select 1 from updated);
$$;
revoke all on function public.microsoft_sender_renew(uuid,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.microsoft_sender_renew(uuid,text,text,text,timestamptz) to service_role;
