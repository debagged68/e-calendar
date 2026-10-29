# Tesco integration — change and regression log

## Design boundary
- Everyday grocery capture, quantity updates and removal use Supabase only. No Tesco authentication or catalogue calls.
- Tesco matching is an explicit batch operation. A Tesco session is required for favourites and last-order matching.
- One shared Tesco account/session is stored in AWS Secrets Manager (`e-calendar/tesco-session`, `eu-north-1`).
- Tesco basket updates require separate explicit approval; none are performed by matching.
- **Important:** Tesco session renewal/reconnection is NOT implemented. Do not describe this as automatic refresh.

## Change history
| Commit | Change | Observed outcome |
| --- | --- | --- |
| `4472763` | Initial favourites matching | Worked |
| `d96cd40` | Three-option matching | TypeScript build failed |
| `51cf187` | Corrected price nullability | Working three-option matching |
| `44ed74f` | Expanded catalogue queries and historical SKU lookups | Runtime errors |
| `c71ceaf` | Reduced additional requests | Still failing |
| `099e7a0` | Restored working retrieval and added diagnostic trace IDs | **User confirmed working** |
| `9174e9e` | Local word-aware product scoring, no extra Tesco requests | Not yet independently verified |
| Current | Clarified Tesco-independent grocery capture and explicit batch matching; improved expired-session message | Awaiting deployment/user verification |

## Regression checklist
1. Confirm Amplify build succeeds.
2. Add, increment, decrement and remove grocery items with an expired Tesco session (no Tesco requests).
3. Confirm both users see saved list through their normal calendar accounts.
4. With an active Tesco session, run one batch match and inspect favourites, last order and cheapest options.
5. Check oats does not match goats cheese; check milk search.
6. Ensure no basket modifications.
7. On matching failure, use AWS logs for `[tesco-matches]` and the reference ID; do not log tokens, cookies or customer identifiers.

## Next work (not implemented)
- Validate Basketeer refresh capability and secure AWS-only interactive reconnection path.
- Persist confirmed Tesco SKU choices across sessions after schema/security review.

## Browser-assisted reconnection implementation
- Added `scripts/tesco-connect.mjs`: refresh using local Chrome, fall back to interactive Tesco login, write validated session directly to AWS Secrets Manager.
- Added `npm run tesco:connect` and setup/security guide `docs/tesco-reconnect.md`.
- This is a laptop-run helper, **not** a calendar-browser button or unattended AWS renewal. Needs scoped AWS credentials and local Playwright installation; untested on physical Mac/Windows machines.

## Catalogue search partial failure (reference 9db42823)
- Observed: valid favourites (100), last order (58), two successful catalogue searches, third search threw an opaque error named `C`.
- Change: isolate each catalogue search failure; continue matching remaining items, retaining favourites and previous-order matches. Return `searchFailed` per item and log index/error name without customer data.
- No changes to authentication, Tesco request counts/limits, product ranking or basket mutation.
- Awaiting Amplify build and live verification.
