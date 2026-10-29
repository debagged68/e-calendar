# Tesco browser reconnection — Mac and Windows

This is the first working implementation of **browser-assisted** Tesco renewal. It is not unattended AWS renewal: a real Chrome browser runs on either user's laptop. AWS hosts the shared calendar and stores the resulting session.

## One-time setup on each laptop
1. Install Node.js 20+ and Google Chrome.
2. Clone this repository and run `npm install`.
3. Install the optional local browser driver: `npm install --no-save playwright`.
4. Configure AWS CLI access (`aws configure sso` then `aws sso login --profile YOUR_PROFILE`, or another secure AWS credential provider). Use an IAM role restricted to `secretsmanager:GetSecretValue` and `secretsmanager:PutSecretValue` for **only** `e-calendar/tesco-session` in `eu-north-1`. Do not give users general AWS admin rights.
5. Set `AWS_PROFILE` to the configured profile if required. No Tesco password or AWS keys should be put in the repository.

## Connect / renew
```sh
npm run tesco:connect
```
The helper first tries refreshing the saved AWS session in a real Chrome window; if renewal fails it opens Tesco's normal sign-in. On success it writes the fresh session to AWS Secrets Manager. Both calendar users share the renewed Tesco session.

To force an interactive sign-in:
```sh
npm run tesco:connect -- login
```

## Security and limitations
- Never paste Tesco cookies, session JSON, passwords or AWS credentials into chat, logs or GitHub.
- The helper uses an in-memory token store. Basketeer's Chrome backend may retain its browser profile locally; protect the laptop account.
- AWS credentials must be configured **once per laptop**. This is a bridge implementation, not yet the requested one-click calendar web UI.
- When both laptops are off, no browser can refresh Tesco. The session may expire after roughly an hour. Either user can renew when needed.
- Grocery capture remains Tesco-independent. Matching remains a separate user-initiated operation.
- The helper does not touch the Tesco basket or product matching logic.
- If `TESCO_SESSION_B64` is configured in Amplify, the application prefers that stale environment variable over Secrets Manager. **Remove that override** (after checking the deployment configuration), otherwise updates to Secrets Manager will not take effect.
- Test on both operating systems and verify Amplify before declaring production-ready.

## In-calendar expiry guidance
The calendar now detects a session-expired matching response and offers a **Reconnect Tesco** link to `/tesco-reconnect`. This page gives local Mac/Windows instructions; it does **not** claim to trigger Chrome automatically. An installed/running local companion service would be required for genuine one-click browser handoff, with a separately designed authentication and CSRF-safe protocol. Do not expose a public endpoint that accepts arbitrary Tesco session data.
