-- Invitation destinations are personal; family events, groceries and Tesco remain shared.
create table public.user_settings (
 user_id uuid primary key references auth.users(id) on delete cascade,
 default_invite_email text,
 updated_at timestamptz not null default now(),
 constraint user_invite_email_valid check (
  default_invite_email is null or (length(default_invite_email)<=254 and default_invite_email ~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
 )
);
alter table public.user_settings enable row level security;
revoke all on public.user_settings from public,anon,authenticated;
grant select,insert,update on public.user_settings to authenticated;
grant all on public.user_settings to service_role;
create policy "read own invitation settings" on public.user_settings for select to authenticated
 using (user_id=(select auth.uid()));
create policy "insert own invitation settings" on public.user_settings for insert to authenticated
 with check (user_id=(select auth.uid()));
create policy "update own invitation settings" on public.user_settings for update to authenticated
 using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

-- Preserve current accounts' effective recipient. Future accounts start with no recipient.
insert into public.user_settings(user_id,default_invite_email)
 select u.id,s.default_invite_email from auth.users u cross join public.family_settings s where s.id=1;

create or replace function calendar_private.queue_invite() returns trigger
 language plpgsql security definer set search_path='' as $$
 declare recipient text;
 begin
  select s.default_invite_email into recipient from public.user_settings s where s.user_id=new.created_by;
  if recipient is not null then
   insert into public.calendar_invites(event_id,recipient,event_snapshot)
    values(new.id,recipient,to_jsonb(new));
   perform calendar_private.dispatch_invites();
  end if;
  return new;
 end;
$$;
revoke all on function calendar_private.queue_invite() from public,anon,authenticated;
comment on column public.family_settings.default_invite_email is
 'Legacy migration source only. Invitation routing now uses public.user_settings by event created_by.';
