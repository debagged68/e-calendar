# Fundamental code risk: duplicated application logic

Treat duplication of application/business logic as a fundamental code risk. Do not introduce it unless the user explicitly overrides this rule for the particular change. Convenience, a different entry point, or a separate UI are not overrides.

Before implementing a feature, find and reuse its existing authoritative workflow. New entry points may transport input, invoke that workflow, and present its result; they must not recreate interpretation, defaulting, validation, date conversion, persistence, or side effects. If reuse requires restructuring, extract shared logic rather than copying it. Record an explicit override and its scope in the change description.

For Quick Action, `src/app/add/page.tsx` owns the workflow. Manual text, in-page speech, and Shortcut input must use its existing `routeQuick`, `interpret`, and `save` functions. `/siri` is a transport-only redirect to Quick Action; it must never grow an independent API or processing implementation. Automatic invocation may skip button presses, but must call the same functions with the same data and rules.

Check both entry points when changing this workflow. Never claim that duplication has been removed merely because one parser is shared.

## Shared ownership after cleanup

- `src/lib/groceries.ts` owns collecting-list lookup/creation, item validation and case-insensitive quantity merging. Quick Action, the whiteboard and calendar summary must reuse it.
- `src/lib/browser-client.ts` and `src/lib/use-browser-user.ts` own the browser Supabase client, access-token retrieval and user-session lifecycle. Server routes must independently verify JWTs through `src/lib/server/user.ts`; never trust browser session state for server authorization.
- `src/lib/server/tesco-session.ts` owns the hosted Tesco session sources, AWS region, format and expiry policy. All hosted Tesco operations use `tescoClient()`; do not add another session loader.
- `src/lib/server/tesco-delivery.ts` owns the reserved-slot and confirmed-order event persistence rules. Entry points retain their distinct confirmation requirements.
- `src/lib/server/groq.ts` owns chat transport. Classification and extraction remain distinct operations within the one Quick Action workflow.
- Retired integration URLs return HTTP 410 through `supabase/functions/_shared/retired.ts`. Do not restore the removed Microsoft sender or per-user Hotmail implementation. Use Brevo invitations and shared ICS feeds.
- Historical migrations are deployment history, not dead application code. Do not delete them or stored user data as a source-cleanup shortcut.

## Tesco reconnect: AWS belongs to the server

The Mac helper must never load the AWS SDK, access Secrets Manager, require `AWS_PROFILE`, or ask for `aws login`. It only renews Tesco's persistent Chrome session. The signed-in calendar relays its nonce-bound result to `/api/tesco-session`, which verifies the user and Tesco session before saving through `src/lib/server/tesco-session.ts`. Shared format validation lives in `src/lib/tesco-session-validation.mjs`; do not copy it into entry points. Refuse old helper protocols before triggering them. Do not claim that removing Mac AWS authentication solves iPhone-only Tesco browser renewal.
