-- One family-wide recipient; no account connection is needed to receive an invitation.
alter table public.family_settings add column default_invite_email text;
alter table public.family_settings add constraint default_invite_email_valid check (
 default_invite_email is null or (length(default_invite_email)<=254 and default_invite_email ~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);
create schema if not exists calendar_private;
revoke all on schema calendar_private from public, anon, authenticated;
create table calendar_private.worker_config (
 id boolean primary key default true check(id), token text not null,
 endpoint text not null
);
insert into calendar_private.worker_config(token,endpoint) values (
 encode(extensions.gen_random_bytes(32),'hex'),
 'https://qkqcrnyjfvphryxasjch.supabase.co/functions/v1/calendar-invites'
);
grant usage on schema calendar_private to service_role;
grant select on calendar_private.worker_config to service_role;

create table public.calendar_invites (
 event_id uuid primary key references public.family_events(id) on delete cascade,
 recipient text not null, event_snapshot jsonb not null,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed')),
 created_at timestamptz not null default now(), sent_at timestamptz,
 attempts integer not null default 0, attempted_at timestamptz, first_attempt_at timestamptz,
 provider_id text, last_error text
);
alter table public.calendar_invites enable row level security;
revoke all on public.calendar_invites from anon, authenticated;
grant select on public.calendar_invites to authenticated;
grant all on public.calendar_invites to service_role;
create policy "family can read invite status" on public.calendar_invites for select to authenticated
 using (exists(select 1 from public.family_events where id=event_id));

-- Only the worker can authenticate and claim jobs. Neither RPC is callable by a browser.
create function public.calendar_invite_worker_authorized(worker_token text) returns boolean
 language sql security invoker set search_path='' as $$
 select exists(select 1 from calendar_private.worker_config where token=worker_token);
$$;
revoke all on function public.calendar_invite_worker_authorized(text) from public,anon,authenticated;
grant execute on function public.calendar_invite_worker_authorized(text) to service_role;

create function public.claim_calendar_invites() returns setof public.calendar_invites
 language sql security invoker set search_path='' as $$
 update public.calendar_invites set status='sending',attempts=attempts+1,attempted_at=now(),first_attempt_at=coalesce(first_attempt_at,now())
 where event_id in (
  select event_id from public.calendar_invites
  where (status in ('pending','failed') or (status='sending' and attempted_at<now()-interval '5 minutes'))
   and attempts<5
   and (attempted_at is null or attempted_at<now()-interval '5 minutes')
   -- Resend keeps idempotency keys for 24 hours. Never retry an uncertain send beyond that window.
   and (attempts=0 or first_attempt_at>now()-interval '23 hours')
  order by created_at limit 5 for update skip locked
 ) returning *;
$$;
revoke all on function public.claim_calendar_invites() from public,anon,authenticated;
grant execute on function public.claim_calendar_invites() to service_role;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
create function calendar_private.dispatch_invites() returns void
 language plpgsql security definer set search_path='' as $$
 declare cfg calendar_private.worker_config;
 begin
  if not exists(select 1 from public.calendar_invites where status in ('pending','sending','failed') and attempts<5
    and (attempted_at is null or (attempted_at<now()-interval '5 minutes' and first_attempt_at>now()-interval '23 hours'))) then return; end if;
  select * into cfg from calendar_private.worker_config where id;
  perform net.http_post(url:=cfg.endpoint,headers:=jsonb_build_object('Content-Type','application/json','X-Calendar-Worker',cfg.token),body:='{}'::jsonb,timeout_milliseconds:=10000);
 end;
$$;
revoke all on function calendar_private.dispatch_invites() from public,anon,authenticated;

create function calendar_private.queue_invite() returns trigger
 language plpgsql security definer set search_path='' as $$
 declare recipient text;
 begin
  select default_invite_email into recipient from public.family_settings where id=1;
  if recipient is not null then
   insert into public.calendar_invites(event_id,recipient,event_snapshot)
    values(new.id,recipient,to_jsonb(new));
   perform calendar_private.dispatch_invites();
  end if;
  return new;
 end;
$$;
revoke all on function calendar_private.queue_invite() from public,anon,authenticated;
create trigger family_event_invitation after insert on public.family_events
 for each row execute function calendar_private.queue_invite();
select cron.schedule('calendar-invite-retry','* * * * *','select calendar_private.dispatch_invites()');
alter publication supabase_realtime add table public.calendar_invites;
