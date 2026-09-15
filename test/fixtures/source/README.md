# Synthetic source fixtures

These fixtures are fully invented and reproduce only the minimum field shape needed by Bazols deterministic source-contract, normalization, encryption round-trip, and log-redaction tests.

They contain reserved synthetic UUIDs, `example.invalid` email addresses, North American 555-01xx fictional phone numbers, synthetic names, and fixed monetary examples. They were not copied from a live source response and are not evidence or an evaluation of current source-system behavior.

The corpus intentionally excludes credentials, cookies, authorization data, operational URLs, raw free-form prose, and unnecessary personal fields. `employees-rating.invalid.json` omits an order ID to exercise fail-closed contract validation; `employees-rating.empty.json` represents a successful zero-result period.
