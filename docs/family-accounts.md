# Separate family logins with a shared calendar and Tesco account

Each person signs into their own Supabase Auth account using an email/password. Accounts remain administrator-created; adding personal preferences does not enable public registration or send account invitations automatically.

## Personal

- Login/session.
- Invitation destination in Settings → Your calendar invitations.
- New family events created by that person queue invitations to that person's chosen address. Their login email and invitation recipient may differ.
- First calendar login opens Settings until the person saves their invitation preference (or explicitly saves blank to disable it).
- The database enforces ownership: another user cannot read or change those preference rows.

## Shared

Family events and imported calendar display, photo, grocery whiteboard and product selections, Brevo sending service and Tesco account/session remain household-wide. She can use the shared Tesco session immediately after signing into e-calendar; she does not need her own Tesco credentials or an AWS login. Tesco session renewal still uses the Mac Chrome helper when needed.

This is access to the same trusted household, not a separate private household/calendar. Members retain the existing shared-event, grocery, picture and calendar-management permissions.

## Add an account

In the project's Supabase dashboard, use Authentication → Users → Add user → Create new user. Use her chosen login email and an initial password; use the administrator's confirmed-user option for this trusted household if email delivery is not configured. Do not share a single login or paste passwords into chat. She then opens the existing calendar URL, signs in and saves her own invitation email in the first-login Settings screen.

Account creation is not performed by editing `auth.users` directly in SQL. Do not assume Supabase's authentication email delivery uses the Brevo event sender; they are separate configurations.

The existing account's effective invitation address was copied into personal settings during migration. Future accounts get no inherited recipient. The old `family_settings.default_invite_email` column is retained only as migration history/rollback data; current code and routing do not use it.

## Verification

UI tests cover first-login setup, saving a new person's recipient, retaining the existing user's recipient, and switching users without carrying the old address into the new user's form. Data-service tests cover reads/upserts, disabling personal invitations, and permission errors. Live transaction checks verify own-row access, cross-user isolation, anonymous denial and preservation of the pre-migration recipient. No real invitation emails or account-creation messages were sent by this change.

Security advisor comparison showed no new findings from the personal-settings table. Pre-existing notices concern private legacy tables and the optional [leaked-password protection setting](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
