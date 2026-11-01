# Code consistency and legacy removal — 1 November 2026

Priority: keep one authoritative implementation of each business rule and remove superseded code before adding features. Implemented directly on `main`, without a new branch.

## Shared owners

| Concern | Authoritative module | Callers |
| --- | --- | --- |
| Browser Supabase client / token | `src/lib/browser-client.ts` | Calendar, Quick Action, whiteboard, Tesco pages |
| Browser user lifecycle | `src/lib/use-browser-user.ts` | Calendar, Quick Action, whiteboard, Tesco basket/diagnostics |
| Server user verification and RLS client | `src/lib/server/user.ts` | Interpretation, transcription and Tesco routes |
| Grocery list, validation and merges | `src/lib/groceries.ts` | Quick Action, whiteboard, calendar summary |
| Tesco credentials / client | `src/lib/server/tesco-session.ts`, `tesco.ts` | Tesco reads, diagnostics and commit |
| Delivery event persistence | `src/lib/server/tesco-delivery.ts` | Reserved slot and confirmed order |
| Groq chat transport | `src/lib/server/groq.ts` | Intent classification and appointment extraction |
| Natural-language workflow | `/add`: `routeQuick`, `interpret`, `save` | Manual text, microphone and transport-only `/siri` |
| Retired integrations | `supabase/functions/_shared/retired.ts` | Old Microsoft API/Edge endpoint and per-user Hotmail endpoint |

## Removed

- Unused IndexedDB photo functions `openPhotoDB`, `savePhoto`, `loadPhoto`; photos use shared Storage.
- Quick Action's unused `addGroceries`, `adjustGrocery`, `scheduleGroceries`, and their unused form/review state. The active grocery path remains `routeQuick`.
- Whiteboard's unused `findOrder`, its obsolete order type/state and token wrapper. The active Tesco basket screen retains slot confirmation.
- Legacy raw MIME writer `invitationMime` and `headerText`. Retained `calendarInvitation` and `base64Utf8`, which Brevo still uses.
- Microsoft OAuth sender implementation in the browser callback, Next proxy and Edge handler. Old URLs give clear retirement information / HTTP 410 rather than carrying a second sender workflow.
- Deployed-only per-user Hotmail reader/parser, replaced by a source-controlled HTTP 410 handler. Shared ICS remains the active reader.
- Repeated browser client/session observers, server auth blocks, grocery creation/merge blocks, Tesco session loaders, delivery write blocks and Groq request construction.

## Consistent rules and retained safeguards

Both hosted Tesco routes now use the same AWS region (`AWS_REGION` or `eu-north-1`), secret format, optional base64 override and numeric expiry check (more than 30 seconds remaining). A session with no valid expiry is rejected by both routes. This deliberately resolves their previous inconsistency.

Grocery additions validate the complete batch, combine repeated names case-insensitively, and reject total quantities above 999 before writing. Whiteboard name editing uses the same validator, replacing its incorrect literal-backslash whitespace expression. List creation retries only the unique-constraint conflict. The calendar summary does not create a list during a read. Browser read/merge/write is still not an atomic cross-device increment; that separate functional change is not claimed here.

The Tesco transfer's selected → sending reservation, uncertain-result handling and no-automatic-retry behaviour are preserved. No real Tesco changes or invitation sends are part of validation.

Legacy endpoint review: the inspected previous-24-hour Edge logs showed one Microsoft request, POST/401, and no per-user Hotmail requests. Current UI references only Brevo/shared ICS. This supports retirement but is not proof about every historical external client; tombstones explain the change instead of failing silently.

Historical migrations, encrypted legacy connection records and private SQL routines are retained. Deleting user credentials/data is not necessary to remove the active implementations. The legacy provider-sync trigger/queue requires a separate database ownership decision; this cleanup does not disable or purge it. The old Siri branch is an ancestor with no unique commits and was not merged or deleted.

## Validation

Run `node --test tests/*.test.mjs` and `npm run build`.

Tests exercise real Quick Action handlers for manual/Shortcut parity, date correction and save validation; real Supabase REST clients with mocked transport for list conflicts, merges, pre-write validation, JWT propagation and delivery writes; session-source/expiry cases; retired endpoint responses; and existing refresh/Brevo/calendar tests. No live user writes are needed.
