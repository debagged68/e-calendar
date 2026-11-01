# Tesco reconnect without a Mac AWS login

Sign into Family Calendar normally. Reconnecting Tesco no longer reads AWS credentials, an AWS profile, or an AWS login on your computer.

## What happens

1. The calendar checks the live Tesco connection. If it works, there is nothing to renew.
2. The signed-in calendar checks that its hosted server can read the shared secret.
3. The calendar checks for helper protocol 2. It refuses to start older helpers that still require local AWS credentials.
4. The local helper renews the persistent Tesco Chrome profile. If Tesco needs sign-in, Chrome opens the normal Tesco page and waits for the session; no Terminal Enter prompt is required by the background helper.
5. A short-lived, nonce-bound result is handed to the approved calendar origin, then sent by authenticated POST to `/api/tesco-session`.
6. The server verifies the user, validates the session using the shared validator, checks Tesco with a read-only favourites request, then writes the secret using the server's runtime AWS credentials. It never selects a secret ID from browser input. The handoff ID is the AWS idempotency token.
7. The calendar acknowledges the handoff and verifies the live basket before returning to shopping. Both Mac and iPhone then use the same server-side Tesco session.

This removes the **AWS renewal** dependency. Tesco browser authentication still runs on the Mac; iPhone-only Tesco renewal is separate work.

## One-time helper update

On your Mac, leave the expired AWS login untouched. Run:

```sh
cd ~/e-calendar
git pull
npm install
npm install --no-save playwright
zsh scripts/install-tesco-launchagent.sh
```

The existing LaunchAgent is replaced/restarted without AWS environment settings. The installer also replaces recognised manually started Tesco helpers on port 47831 and verifies that protocol 2 is running; it refuses to stop unrelated processes. Reload the calendar's Reconnect Tesco page after Amplify deploys the new commit. An old helper produces an update message rather than attempting an AWS login.

For a foreground helper, use `npm run tesco:helper`. The older `npm run tesco:connect` command is now an alias for that same helper, rather than a separate AWS-writing script.

## Server configuration

Amplify's **compute role** (not the Mac's AWS CLI profile) needs `secretsmanager:GetSecretValue` and `secretsmanager:PutSecretValue` for the existing `e-calendar/tesco-session` secret in `eu-north-1`, or the server-side `TESCO_SECRET_ID` / `AWS_REGION` configuration. Add no AWS access keys to the browser or helper. Remove any old `TESCO_SESSION_B64` override: it would hide newly saved sessions and is therefore reported as a server configuration issue.

The server role's live write permission cannot be inferred from successful read access. If publishing fails, the calendar reports a server configuration issue and explicitly says not to renew the Mac AWS login. Fixing an IAM permission is one-time server administration, not a recurring user login.

## Security and verification

- Helper binds only to loopback; exact Host and approved Origin checks remain mandatory.
- Session result requires the originating approved site and a random handoff ID, is accessible for at most two minutes after renewal, and is cleared after acknowledgement. Session data is never in URLs, logs or disk exports.
- Helper does not receive AWS credentials or the existing AWS secret. It only handles the newly browser-minted Tesco session.
- Server requires a verified Family Calendar JWT, caps input size, validates the session and reads Tesco before changing the fixed secret.
- No basket mutation is used to test authentication.
- Tests cover a deliberately invalid local AWS profile, helper access controls/expiry, old-helper detection, browser handoff, unauthorised input, server IAM failure, and existing grocery/transfer behaviour.

Manual acceptance: with your local AWS login still expired, reconnect from the updated calendar and confirm product matching works. Until that succeeds against the deployed server and your Chrome profile, the live end-to-end result remains unconfirmed.
