# Architecture

[Home](../README.md) · [Setup](setup.md) · [User flow](user-flow.md) · [Privacy & security](privacy-and-security.md)

The workflow is a stateful request compiler: Telegram supplies an informal task, an intermediate fidelity map makes the task explicit, and a draft–audit–repair sequence produces a portable Kazakh prompt. The export contains 53 nodes and uses only built-in n8n nodes plus n8n's OpenAI integration.

<p align="center">
  <a href="assets/n8n-workflow-overview.png"><img src="assets/n8n-workflow-overview.png" alt="The complete 53-node n8n workflow canvas"></a><br>
  <sub>Open the workflow overview for the full-size canvas.</sub>
</p>

## Execution paths

### 1. Ingress and input contract

`Telegram Trigger` subscribes to `message` and `channel_post`. `Input Contract / Session Key` selects `text` first and `caption` second, strips NUL characters, trims whitespace, and records counts for characters, non-whitespace characters, Unicode letters/marks, numbers, URLs, and lines.

An input is usable when it:

- has text or a caption;
- is not only a `/command` (including `/command@botname`);
- contains a Unicode letter/mark, number, URL, or a small set of code-like punctuation; and
- has a Telegram chat ID.

Voice/audio updates without a caption are labeled but rejected; there is no transcription stage. Although the Code node knows how to inspect edited-message shapes, the trigger is not subscribed to edited-message update types in this export.

Each update receives:

- `request_id = chat_id : message_id` (a timestamp is the fallback when no message ID exists);
- `session_key = chat_id : from_user_id : message_thread_id`.

This scopes clarification state to a user inside a chat and, when present, a Telegram topic. Channel posts may lack `from_user_id`; those use `nouser`, and clarification is disabled for them.

### 2. State housekeeping and routing

The workflow creates `prompt_clarification_sessions` if it does not exist. At the beginning of every execution it:

1. marks pending rows with an elapsed `expires_at` as `expired`;
2. deletes non-pending rows whose `updated_at` is older than seven days;
3. fetches the newest pending row for the current session key.

Cleanup is **event-driven**. The 30-minute expiry is enforced on the next workflow execution, not by a background timer, and physical deletion after seven days likewise waits for a later request.

The session router yields one of three routes:

| Route | Condition | Result |
| --- | --- | --- |
| `new_request` | No live pending row | Continue as a new task. |
| `duplicate_pending` | Pending row has the same `request_id` | Return zero items and stop. |
| `pending_candidate` | Same session, different request ID | Ask the answer classifier whether the new message resolves the stored question. |

The classifier is conservative: uncertain messages should be treated as new requests. If its response is missing or cannot be parsed, `clarification_is_answer` is false, the old row is cancelled, and the incoming message starts over. This avoids joining unrelated content to a stored task.

If the message is an answer, the row becomes `resolved`, the incoming text is stored as a one-element `answers` array, and execution resumes from the persisted original request and request map. The mapper is skipped. If it is a new task, the previous row becomes `cancelled` before normal mapping begins.

### 3. Request fidelity map

`Agent 1 - Request Mapper` returns strict JSON rather than prose. Its schema separates:

- objective, deliverable, domain, audience, and tone;
- supplied facts, constraints, preferences, invariants, names/tokens, and exclusions;
- output and success characteristics;
- dependencies and ambiguities;
- organizational inferences, safe assumptions, and unsafe assumptions;
- a clarification decision with information gain and focused Kazakh questions.

The parser tolerates a fenced response and can recover the first JSON object embedded in extra text. It normalizes every array field and caps questions at two. Clarification proceeds only when all of these are true:

- the Telegram context allows it;
- no clarification round has already occurred;
- the model returned `needed: true`;
- gain is exactly `high`; and
- at least one non-empty question exists.

If parsing fails, a conservative fallback map preserves the original text as an invariant and proceeds without clarification.

### 4. Bounded clarification

`Prepare Clarification Session` stores the state with an expiry 30 minutes in the future. The table is upserted by `session_key`, so a new pending clarification replaces the single row for that conversation context. The user receives one or two numbered questions in Kazakh, and the temporary processing message is removed.

The workflow does not wait inside the same execution. A later Telegram update starts a new execution and reconnects it to the stored state through the session router.

### 5. Architect, auditor, editor

The main generation pipeline assigns separate contracts to three model calls:

| Stage | Configured model | Responsibility | Output contract |
| --- | --- | --- | --- |
| Kazakh Prompt Architect | `gpt-5.6-sol` | Improve the representation while preserving the mapped request. | Only a standalone prompt in modern standard Kazakh. |
| Prompt Fidelity Auditor | `gpt-5.6-terra` | Find substantive intent drift, invention, omission, unsafe assumptions, bad Kazakh, or unhelpful boilerplate. | A concise repair memo, or `NO_SUBSTANTIVE_CHANGES`. |
| Final Prompt Editor | `gpt-5.6-sol` | Apply valid repairs without gratuitous rewriting. | Only the final, copyable Kazakh prompt. |

All AI system prompts explicitly frame interpolated request material as untrusted content. They preserve proper names, code, URLs, identifiers, quotations, and other source-language tokens when translation would be destructive. They also prohibit requests for private chain-of-thought and default to provider-neutral prompts unless the user's task requires a specific provider.

The OpenAI nodes set `store: false`. That is an API request setting; it does not control n8n execution retention, Telegram retention, provider logging outside that flag, or infrastructure logs.

### 6. Packaging and delivery

The architect response must contain non-empty text. If it does not, the workflow sends a Kazakh generation error and removes the status message.

The final editor response is preferred, but an empty/missing response falls back to the architect draft. Non-empty output up to 3,600 characters is sent as a direct reply. Longer output is converted to a UTF-8 file named with the UTC date and Telegram message ID, then sent as a document.

## State schema

| Field | Purpose |
| --- | --- |
| `session_key` | Conversation scope (`chat:user:thread`) and upsert key |
| `request_id` | Source update identity (`chat:message`) |
| `chat_id`, `from_user_id`, `message_thread_id` | Telegram routing/context identifiers, stored as strings |
| `original_text` | The user's task before amplification |
| `request_map_json` | Serialized mapper output reused after clarification |
| `questions_json`, `answers_json`, `question_count` | Clarification content |
| `status` | `pending`, `resolved`, `cancelled`, or `expired` |
| `created_at`, `updated_at`, `expires_at` | ISO timestamps used for lifecycle handling |

## Retry and degradation behavior

| Failure point | Implemented behavior |
| --- | --- |
| Classifier call/error or invalid JSON | Up to 3 tries; then treat the message as a new request and cancel the old pending state. |
| Mapper call/error or invalid JSON | Up to 3 tries; then use the fallback map and skip clarification. |
| Architect call/error or empty output | Up to 3 tries; then send a user-visible Kazakh error. |
| Auditor call/error or empty output | Up to 3 tries; then substitute `NO_SUBSTANTIVE_CHANGES`. |
| Final editor call/error or empty output | Up to 3 tries; then deliver the architect draft. |
| Telegram send | Up to 3 tries with a 2-second interval; an exhausted send failure stops that branch. |
| Status-message deletion | Best effort (`continueOnFail`); delivery is not undone if cleanup fails. |
| Data Table operation | No configured retry; failure stops the execution. |

OpenAI calls wait three seconds between attempts except the clarification classifier, which waits two seconds. The export has no workflow-level error trigger, alerting channel, or dead-letter path.

## Cost and latency shape

A completed, unambiguous new request normally invokes four model calls: mapper, architect, auditor, and editor. A resumed clarification execution invokes classifier, architect, auditor, and editor; the mapper result comes from stored state. An unrelated message received while a clarification is pending can invoke the classifier and then the full four-stage new-request path.

The workflow intentionally trades latency and token usage for separation of concerns and fidelity checking. No benchmark, latency target, or cost estimate is included because none is encoded or measured in the project.

## Concurrency and idempotency

Duplicate suppression applies only when the same request ID matches a currently pending clarification row. Completed requests have no durable idempotency record. Because state is a single Data Table row upserted by session key, overlapping messages in the same session can race; the workflow does not use a lock or transaction spanning lookup, classification, and update.

For a public or high-volume deployment, treat access control, rate limiting, execution concurrency, alerting, and retention configuration as deployment responsibilities rather than properties of this export.

Next: [install and verify the workflow](setup.md) or review its [privacy and security boundaries](privacy-and-security.md).
