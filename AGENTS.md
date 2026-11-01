# Fundamental code risk: duplicated application logic

Treat duplication of application/business logic as a fundamental code risk. Do not introduce it unless the user explicitly overrides this rule for the particular change. Convenience, a different entry point, or a separate UI are not overrides.

Before implementing a feature, find and reuse its existing authoritative workflow. New entry points may transport input, invoke that workflow, and present its result; they must not recreate interpretation, defaulting, validation, date conversion, persistence, or side effects. If reuse requires restructuring, extract shared logic rather than copying it. Record an explicit override and its scope in the change description.

For Quick Action, `src/app/add/page.tsx` owns the workflow. Manual text, in-page speech, and Shortcut input must use its existing `routeQuick`, `interpret`, and `save` functions. `/siri` is a transport-only redirect to Quick Action; it must never grow an independent API or processing implementation. Automatic invocation may skip button presses, but must call the same functions with the same data and rules.

Check both entry points when changing this workflow. Never claim that duplication has been removed merely because one parser is shared.
