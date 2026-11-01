# Fundamental code risks

## R001 — Duplicated application logic (high)

**Standing rule:** Never duplicate application logic unless the user explicitly overrides this rule for that specific change. This rule is also in root `AGENTS.md`, so future coding work must follow it.

**Incident:** Siri acquired a separate processing API that repeated Quick Action's classification, grocery handling, validation, date conversion and event persistence. Sharing the AI interpreter did not make the complete workflows identical. This divergence complicated investigation of a wrong-weekday event.

**Required control:** Keep one authoritative workflow. An adapter can pass text and trigger it; it cannot reimplement it. Automatic actions call the existing functions instead of maintaining parallel code. Test the original and adapter entry points together, including login delays, date defaults, failures and duplicate submission prevention.

**Correction:** `/siri` redirects text into `/add` for automatic invocation. Both direct Quick Action and Shortcut input execute `routeQuick`, `interpret`, and `save` in the same component. The separate `/api/siri` processing route has been deleted. A ref prevents repeated automatic invocation, and the executable URL is removed before processing so a refresh cannot replay it.
