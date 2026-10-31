# Family invitations sent from Hotmail

Set the shared recipient in **Settings → Calendar invitations → Default invitation email**, then use **Connect Hotmail** to authorize the sender. The sender and recipient can be the same Hotmail account. Every new family event, including Quick Action, Siri and Tesco-created events, queues one calendar invitation. Blank recipient disables invitations; changing it affects future events only.

No owned domain, DNS records or Resend account is required. Microsoft requires the app itself to be registered once before it can request permission. A personal Hotmail account can authorize the registered app; a business mailbox is not required. App registration requires access to a Microsoft Entra tenant/Azure account; see Microsoft's prerequisites below. If the portal will not let your personal account register an app, this must be resolved before the Connect button can work.

## One-time Microsoft application setup

1. Open https://entra.microsoft.com/ → **App registrations → New registration**. Name it `Family e-calendar` and choose **Personal Microsoft accounts only** (or organizational directories and personal accounts).
2. Add a **Web** redirect URI. Copy the exact **Microsoft callback address** shown under Calendar settings; it is your existing calendar site's HTTPS address followed by `/microsoft-connect`. Use Web, not Single-page application. No custom domain is needed.
3. Under **API permissions**, add Microsoft Graph **Delegated** permissions `User.Read` and `Mail.Send`. Do not add application permissions. The connection also requests `offline_access` so the server can renew access without asking you to sign in for each event.
4. Copy the **Application (client) ID**. Under **Certificates & secrets**, create a client secret and copy its **Value**, not its Secret ID. Note its expiry; replace the secret before it expires.
5. In the e-calendar Supabase project's **Edge Functions → Secrets**, add:

   | Secret | Value |
   | --- | --- |
   | `MICROSOFT_CLIENT_ID` | Application (client) ID |
   | `MICROSOFT_CLIENT_SECRET` | Client secret **Value** |
   | `ECALENDAR_APP_URL` | Existing calendar site's HTTPS origin, without `/microsoft-connect` or any other path |

6. Reload the calendar, open Settings, select **Connect Hotmail**, sign in and allow the requested permissions. Then create a test event, check **Invite sent**, and accept the invitation in Outlook/Hotmail. Pending invitations will also be processed after connection.

Never paste your Microsoft password or client secret into calendar settings, source code, public environment variables or chat. The client secret belongs only in Supabase Secrets. No Amplify secrets are needed for this connection.

Microsoft references:
- https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app
- https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
- https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0

## Connection security

The signed-in family user starts a short-lived authorization-code flow with PKCE. The callback verifies a browser-session state value, and the server atomically consumes the matching, user-bound state. Microsoft tokens remain on the server and are encrypted in private database tables; browsers only receive connection status and sender email. The account's connecting user controls disconnect/replacement. Token renewal uses the refresh token; revoked consent requires reconnecting. Disconnecting removes stored tokens but does not revoke permissions at Microsoft; those can also be removed in Microsoft account app permissions.

`microsoft-connect` verifies Supabase user tokens itself. The `calendar-invites` worker authenticates using its private worker token. Both functions have gateway JWT verification disabled because they perform explicit authentication. Neither exposes Microsoft credentials. Server-only RPCs are denied to browser and anonymous roles.

## Delivery and scope

Invitations contain an RFC 5545 calendar request sent through Microsoft Graph `/me/sendMail`, with a UTF-8 MIME attachment and a stable event UID. Date-only events are all-day; timed events preserve stored instants. Messages are saved in Hotmail Sent Items. **Invite sent** means Microsoft accepted the send request; it does not mean the recipient accepted or that delivery is complete.

The trigger and minute retry job cover every new `family_events` row. Missing Microsoft configuration/connection leaves jobs pending. Throttling responses can be retried up to five times. Microsoft sendMail has no idempotency guarantee, so ambiguous timeouts or worker interruptions are marked failed and not automatically resent: check Hotmail Sent Items first.

This initial feature does not synchronize subsequent edits, send cancellation emails, track RSVPs or suppress copies returned by external ICS subscriptions. Deleting an event removes its pending invite; already sent invitations remain in the recipient's calendar until removed there.

## Validation

- `npm run build`
- `node --test tests/calendar-invites.test.mjs`
- Database tests verify recipient snapshots, enable/disable, duplicate prevention, OAuth state ownership/expiry/single use, encrypted token storage and server-only permissions, with test writes rolled back.
- Real Microsoft sign-in and Outlook acceptance require completing the app registration above.
