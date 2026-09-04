# Contributing

[Project overview](README.md) · [Architecture](docs/architecture.md) · [Setup](docs/setup.md) · [Security policy](SECURITY.md)

Contributions should make the implemented workflow clearer, safer, or more faithful without claiming behavior it does not have.

## Workflow changes

Treat [`workflow/kazakh-prompt-engineering-bot.json`](workflow/kazakh-prompt-engineering-bot.json) as the canonical artifact.

1. Import it into a current n8n test instance.
2. Make changes in the n8n editor rather than hand-editing generated JSON when practical.
3. Exercise every affected branch with test Telegram and OpenAI credentials.
4. Remove execution data, pin data, real credential references, instance metadata, and private identifiers before export.
5. Replace credential references with the existing placeholder IDs/names.
6. Export back to the canonical path and run `npm test`.
7. Update the README and relevant docs when behavior, models, retention, node counts, or setup changes.

Node names are an internal API: expressions use `$('Node Name')` throughout the workflow. If a node is renamed, update all references and test both new-request and clarification-resume paths.

## Minimum manual test matrix

- clear request without clarification;
- a request that produces a clarification and a valid follow-up answer;
- unrelated new request while clarification is pending;
- duplicate delivery of an update waiting on clarification;
- command-only and unsupported non-text input;
- architect failure/empty output;
- auditor or final-editor failure fallback;
- direct reply and `.txt` delivery;
- failure to delete a status message;
- stale-session expiry and seven-day non-pending purge behavior.

Use synthetic content and test accounts. Never attach a production execution export to a public issue.

## Documentation changes

Keep claims traceable to node configuration or observed tests. Distinguish an implemented guarantee from an operator recommendation. Avoid provider quality comparisons, performance claims, and version compatibility claims without reproducible evidence.

## Pull requests

Explain the user-visible change, the nodes affected, what you tested, and any migration or privacy impact. Keep unrelated cleanup out of the same change.
