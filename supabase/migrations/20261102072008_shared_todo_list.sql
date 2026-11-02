-- Shared household tasks; all existing authenticated household accounts may collaborate.
create table public.todo_items (
 id uuid primary key default gen_random_uuid(),
 title text not null check (length(btrim(title)) between 1 and 1500),
 due_date date,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 event_id uuid references public.family_events(id) on delete set null,
 check (event_id is null or completed_at is not null)
);
create index todo_items_active_due on public.todo_items(due_date,created_at) where completed_at is null;
alter table public.todo_items enable row level security;
revoke all on public.todo_items from public,anon,authenticated;
grant select,delete on public.todo_items to authenticated;
grant insert(title,due_date,created_by) on public.todo_items to authenticated;
grant update(title,due_date,completed_at,event_id) on public.todo_items to authenticated;
grant all on public.todo_items to service_role;
create policy todo_read on public.todo_items for select to authenticated using ((select auth.uid()) is not null);
create policy todo_add on public.todo_items for insert to authenticated with check (created_by=(select auth.uid()) and completed_at is null and event_id is null);
create policy todo_edit on public.todo_items for update to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
create policy todo_delete on public.todo_items for delete to authenticated using ((select auth.uid()) is not null);
-- One atomic event write. Existing family_events trigger owns invitation queuing.
-- Task row lock makes simultaneous/retried conversions return the same event.
create function public.save_quick_event(p_title text,p_event_date date,p_start_at timestamptz,p_end_at timestamptz,p_important boolean default false,p_task_id uuid default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare task public.todo_items; event uuid;
begin
 if auth.uid() is null then raise exception 'Please sign in'; end if;
 if p_task_id is not null then
  select * into task from public.todo_items where id=p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if task.event_id is not null then return task.event_id; end if;
  if task.completed_at is not null then raise exception 'Task is already completed'; end if;
 end if;
 if p_title is null or length(btrim(p_title)) not between 1 and 160 or p_event_date is null or p_start_at is null or p_end_at is null or p_end_at<=p_start_at then raise exception 'Enter a title, date and valid start and end times'; end if;
 insert into public.family_events(title,event_date,start_at,end_at,important,created_by)
 values(btrim(p_title),p_event_date,p_start_at,p_end_at,coalesce(p_important,false),auth.uid()) returning id into event;
 if p_task_id is not null then
  update public.todo_items set completed_at=now(),event_id=event where id=p_task_id;
 end if;
 return event;
end;
$$;
revoke all on function public.save_quick_event(text,date,timestamptz,timestamptz,boolean,uuid) from public,anon;
grant execute on function public.save_quick_event(text,date,timestamptz,timestamptz,boolean,uuid) to authenticated;
alter publication supabase_realtime add table public.todo_items;
