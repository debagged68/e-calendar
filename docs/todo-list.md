# Shared to-do list

## Requirements and behaviour

- A To-do card sits alongside Shopping Whiteboard on the calendar. Its count is unfinished task rows, excluding completed/converted tasks. A loading or failed read never displays a misleading zero.
- All signed-in household members share tasks, just as they share the family calendar and groceries. No private task lists or assignment system is introduced.
- `/todo` supports add, edit, optional due date, delete with confirmation, completion, Undo and reopening completed tasks. Completion shows a large green tick; completed rows have crossed-out titles in a collapsed Completed section. Overdue/dated tasks sort ahead of undated tasks.
- Quick Action rules, in precedence order: leading whole word `add` means groceries; otherwise both a date and a time mean an event; otherwise a task. `Buy milk` therefore creates a task; `Add milk Wednesday at 10` remains groceries. Missing date/time are never filled with the previous 09:00 default.
- Dates may be relative (for example next Wednesday); the existing calendar date calculation remains authoritative. Ambiguous extraction does not automatically create an appointment.
- Tasks do not queue email or appear on the calendar. Converting a task explicitly opens the existing Quick Action event form and requires review, a date and time. The converting user's saved invitation email applies, through the existing database trigger.
- Conversion creates the event and completes/links the task in one transaction. Failed conversion leaves the task active. Concurrent/retried conversions of one task return the existing event instead of queuing another invitation. Converted tasks link back to calendar event details.
- Task rows/counts update through Realtime plus the existing 60-second foreground polling/wake/focus/online lifecycle. Internet and sign-in are required.

## Architecture and function ownership

| File / functions | Purpose |
| --- | --- |
| `src/lib/entry-rules.ts`: `startsWithAdd`, `hasDate`, `hasTime` | One set of leading-word and explicit date/time evidence guards. Prevents AI defaults turning incomplete tasks into appointments. |
| `src/lib/server/appointment.ts`: `extractAppointment` | Extracts one event using Groq and the existing relative-date normalisation. Both interpretation endpoints reuse this implementation. |
| `/api/interpret-entry`: `POST` | Authenticates, applies routing precedence, extracts grocery items or returns the single extracted event draft. Returns incomplete requests as tasks without an AI round trip. |
| `/api/interpret-appointment`: `POST` | Authenticated adapter to the same event extractor, including explicit task conversion. |
| `src/app/add/page.tsx`: `routeQuick`, `interpret`, `save` | The sole Quick Action workflow. Manual text, speech and Siri call it. Conversion loads the task and calls the same `interpret` and `save`; it never uses a separate event/email implementation. `interpret` accepts an already extracted draft, avoiding a second AI request. |
| `src/lib/todos.ts`: `todoTitle`, `todoItems`, `readTodo`, `addTodo`, `updateTodo`, `deleteTodo` | Authoritative task validation and browser database access. Conditional updates refuse to reopen/edit a task concurrently converted to an event. |
| `src/lib/use-todos.ts`: `useTodos` | Shared list/count loading, subscription, polling, wake/focus refresh and stale-response protection. Both calendar and task page reuse it. |
| `src/app/todo/page.tsx`: `run`, `submit`, `complete`, `row` | Presents tasks; serialises local mutations, delegates writes to task service, and shows feedback/Undo. No interpretation or event persistence lives here. |
| `public.save_quick_event` | Single Quick Action event write. Runs as caller under RLS, sets event creator from `auth.uid()`, locks optional source task, writes event and closes task atomically. Existing `calendar_private.queue_invite()` owns all invitation side effects. |

## Data and access

`public.todo_items`: UUID, title (1–1500 characters), optional due date, creator, creation time, completion time and optional linked event. RLS and explicit grants require a signed-in household account; inserts must use that account's creator ID. Creator/creation fields cannot be edited by clients. The event RPC is unavailable to anonymous callers and uses security invoker with an empty search path. This continues the existing trusted-household access model, not a separate multi-tenant design.

Migration: `20261102072008_shared_todo_list.sql`. Existing data and historical migrations remain intact.

## Verification

Automated checks cover routing precedence, missing-date/time guards, extraction reuse, manual/Siri task creation, reviewed conversion through the same save function, and conversion errors. A rollback-only live database transaction verified atomic conversion, personal-recipient invitation queueing, retry idempotence, preservation after invalid conversion, and anonymous access denial. Fixtures and queued invitations were rolled back; no test email was sent. Existing security advisor findings are unchanged.
