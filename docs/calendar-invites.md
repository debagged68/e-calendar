# Family invitations through an independent email service

The default invitation email in Settings is the **recipient**. It may be a personal Hotmail address. E-calendar sends the invitation through Brevo; no Microsoft login, Entra registration or mailbox access is needed.

Every new family event, including Quick Action, Siri and Tesco-created events, queues an invitation when the default email is set. Blank disables invitations. Changing the default affects future events, not existing events.

## One-time sender setup

1. Create a Brevo account at https://www.brevo.com/ and enable transactional email sending. A free plan is available; check the current quota and any account approval requirements before enabling sending.
2. In Brevo's **Settings → Senders, Domains & Dedicated IPs → Senders**, add a sender and complete its email verification. An existing personal email can be used for this verification: no ownership of the Amplify hosting domain is required. Brevo may replace free-email/unauthenticated sender addresses with its own compliant sending address. Follow any account-specific requirements shown by Brevo. A domain you control is an alternative, not a requirement of this integration.
3. Create a Brevo **API key** (not an SMTP password).
4. Open https://supabase.com/dashboard/project/qkqcrnyjfvphryxasjch/functions/secrets and add:

   | Secret | Value |
   | --- | --- |
   | `BREVO_API_KEY` | Your Brevo API key |
   | `CALENDAR_FROM_EMAIL` | The sender email you verified in Brevo |

   These belong in Supabase Edge Function Secrets, not Amplify or calendar Settings. Never put the key in source code, a public environment variable or chat.
5. In e-calendar, open **Settings → Calendar invitations**, retain the desired default recipient and choose **Refresh email status**. “Email service configured” means the server has both settings; it does not verify account approval, sender verification or delivery.
6. Create a family event. Check the invitation email in Hotmail, including Junk, and open/accept `invitation.ics` to add it to the calendar. The appearance of invitation/accept controls varies by mail client and sender identity rewriting. Check Brevo's transactional logs if it does not arrive. No real delivery is claimed until this test succeeds.

The free-address sender substitution is controlled by Brevo. The calendar attachment retains the configured sender as its organiser; Outlook handling of a rewritten sender must be checked with a real email. This integration does not promise automatic acceptance or native invitation buttons in every client.

## Delivery and retries

The `calendar-invites` Edge Function accepts an authenticated user GET for non-secret setup status. Its POST worker requires the existing private worker token. Sender credentials never reach the browser. The database trigger and scheduled worker continue to cover every new family event; no new database schema is required.

Missing configuration leaves invitations pending without using delivery attempts. Brevo receives a UTF-8 base64 `invitation.ics` attachment with `METHOD:REQUEST`, a stable event UID and the stored event dates/times. API HTTP 201 with a message ID records provider acceptance as “Invite sent”; it does not mean inbox delivery or acceptance by the recipient.

Only explicit rate-limit refusals are retried (existing five-attempt/five-minute retry policy). Network timeouts, server errors, interrupted submissions or missing acceptance IDs may represent an uncertain send and are not blindly retried. Check Brevo logs before manually requeuing an uncertain invitation. Existing failed Microsoft jobs are not automatically reset. Pending jobs are processed once the new service is configured.

Edits and cancellations are not emailed, RSVP replies are not read, and external ICS subscriptions may show a duplicate of an invited event. Deleting an event removes pending work but cannot remove an invitation already sent.

## Validation

- `node --test tests/calendar-invites.test.mjs tests/invitation-mail.test.mjs`
- `npm run build`
- Tests cover dates, time zones, Unicode, injection, provider payload and acceptance, missing configuration, rate limiting and uncertain delivery.
- Real delivery requires the Brevo account, verified sender and API key above; it has not been tested without those credentials.

References:
- https://developers.brevo.com/reference/send-transac-email
- https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email
- https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders
- https://supabase.com/docs/guides/functions/secrets

The older Microsoft callback files remain for compatibility with existing links, but the invitation worker and Settings no longer use Microsoft sending or its stored credentials.
