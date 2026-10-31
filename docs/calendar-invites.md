# Automatic family-calendar invitations

Set the shared recipient in **Settings → Calendar invitations → Default invitation email**. Empty means disabled. Every new row in `family_events` queues one invitation, covering calendar entry, Quick Action, Siri and Tesco-created events. Existing events are not backfilled. Changing the default affects future events; queued invitations retain their original recipient.

## Sender setup (required once)

1. Create a Resend account and verify a sender domain you own.
2. In the e-calendar Supabase project's **Edge Functions → Secrets**, add:
   - `RESEND_API_KEY`: an email-sending API key from Resend.
   - `CALENDAR_INVITE_FROM`: the bare verified sender address, for example `calendar@your-verified-domain.co.uk`.
3. Save the destination email in Calendar settings, then add a test family event. Check that it shows **Invite sent**, and accept the invitation in Outlook. No Microsoft OAuth connection is required.

Do not put these secrets in the repository, public variables, or the calendar settings form. `CALENDAR_INVITE_FROM` is the sender; the configured default email is the recipient. A Hotmail address cannot be used as the verified sender domain.

## Delivery and scope

A database trigger snapshots the event and recipient in `calendar_invites`, then calls the `calendar-invites` Edge Function asynchronously. The function authenticates with a private worker token generated inside the database; JWT validation is replaced by this explicit webhook authentication. Browser/anonymous roles cannot access the token, claim jobs, or write invite status. Existing family access rules govern reading status.

The cron job retries eligible pending/failed jobs every minute. Missing sender configuration leaves jobs pending. Failed provider requests receive at most five attempts with a five-minute gap; retries use a stable provider idempotency key and identical payload. Retries stop after 23 hours from the first sending attempt because the provider retains idempotency keys for 24 hours. Exhausted jobs are shown as failed; sent means the provider accepted the email, not that the recipient accepted the event.

Date-only events become all-day invitations. Timed events retain stored UTC instants, with a one-hour end fallback. RFC 5545 escaping and UTF-8 line folding protect event titles and preserve Unicode.

This feature sends initial invitations. It does not synchronize later event edits, send cancellation emails, track RSVP replies, or suppress copies returned by a subscribed external ICS feed. Deleting an event removes its pending invitation. An invitation already sent remains in the recipient's calendar until removed there.

## Validation

- `npm run build`
- `node --test tests/calendar-invites.test.mjs`
- Database transaction tests verify enable/disable, email validation, recipient snapshots, single invitation per event, cascade removal and access controls; all test rows/settings are rolled back.
- A real Outlook acceptance test still requires sender configuration.
