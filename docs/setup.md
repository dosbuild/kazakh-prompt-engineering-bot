# Setup and adaptation

[Home](../README.md) · [User flow](user-flow.md) · [Architecture](architecture.md) · [Privacy & security](privacy-and-security.md)

This guide installs the workflow without changing its behavior. n8n's interfaces evolve, so menu labels can vary slightly; the imported node configuration is the authority.

## Requirements

- An n8n Cloud or self-hosted instance with the exported node versions available. The workflow depends on the Data Table node, Code node v2, Telegram Trigger/action nodes, Convert to File, and the OpenAI node's model-response operation.
- A Telegram bot token created through [BotFather](https://core.telegram.org/bots/features#botfather).
- An OpenAI API credential authorized to use the configured `gpt-5.6-terra` and `gpt-5.6-sol` model IDs.
- A public HTTPS webhook route from Telegram to n8n. n8n Cloud provides this; self-hosted operators must configure their instance URL, TLS, and reverse proxy correctly.

Useful upstream references:

- [Importing and exporting n8n workflows](https://docs.n8n.io/workflows/export-import/)
- [Telegram credentials](https://docs.n8n.io/integrations/builtin/credentials/telegram/)
- [Telegram Trigger](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.telegramtrigger/)
- [OpenAI credentials](https://docs.n8n.io/integrations/builtin/credentials/openai/)
- [n8n Data Tables](https://docs.n8n.io/data/data-tables/)
- [Self-hosted SSL guidance](https://docs.n8n.io/hosting/securing/set-up-ssl/)

No community node package, external database, npm dependency, or Telegram mini app is required by the workflow.

The export does not record the n8n release that authored it, so this repository does not claim an unverified minimum n8n version. Use a current release that recognizes the imported node types and versions; unknown-node behavior is covered in [Troubleshooting](#data-table-nodes-are-missing-or-incompatible).

## 1. Inspect and import

Optionally validate the artifact locally first:

```bash
npm test
```

Then import [`workflow/kazakh-prompt-engineering-bot.json`](../workflow/kazakh-prompt-engineering-bot.json) through n8n's **Import from File** action. The imported workflow is inactive by default.

The export contains placeholder credential references:

```text
PLACEHOLDER_TELEGRAM_CREDENTIAL_ID
PLACEHOLDER_OPENAI_CREDENTIAL_ID
```

They are labels, not working credentials and not secrets.

## 2. Configure Telegram

1. Create a Telegram bot with BotFather and copy its token into a new n8n Telegram credential.
2. Assign that credential to `Telegram Trigger` and every Telegram action node. If n8n offers to replace matching missing credentials across the workflow, verify every Telegram node afterward.
3. For private chats, open the bot and send it a message after activation.
4. For groups or channels, add the bot with the permissions needed to receive updates, send messages/documents, and delete its own temporary status messages. Telegram privacy mode and channel permissions can change which messages reach the trigger.

Telegram allows only one active webhook per bot token. Reusing the same bot in another active trigger can replace the webhook and make one workflow appear silent.

## 3. Configure OpenAI

1. Create an n8n OpenAI credential with your API key.
2. Assign it to all five OpenAI nodes:
   - `Clarification Answer Classifier`
   - `Agent 1 - Request Mapper`
   - `Agent 2 - Kazakh Prompt Architect`
   - `Agent 3 - Prompt Fidelity Auditor`
   - `Agent 4 - Final Prompt Editor`
3. Open each node and confirm that its configured model is available to the credential.

The model assignment is part of the design, not a compatibility promise. If your account does not expose one of the exact IDs, choose a model that supports the node's Responses-style text operation and the configured token/output controls. Update every occurrence consistently, then test JSON compliance in the classifier and mapper as well as Kazakh quality in the architect/editor. Different models can change clarification frequency, fidelity, latency, cost, and language quality.

## 4. First activation

Save and activate the workflow. On the first incoming update, `Ensure Clarification Table` creates `prompt_clarification_sessions` with the expected columns. No manual table creation is normally necessary.

Start with a clear text task, for example:

```text
Шағын наубайханаға арналған бір айлық Instagram контент-жоспарын құруға көмектес.
```

Expected behavior:

1. The bot replies with a temporary processing message.
2. It either asks a focused clarification or returns a standalone Kazakh prompt.
3. The temporary status message is deleted after the handled branch completes.

The [illustrated user flow](user-flow.md) shows this sequence through a clarification and long-file delivery.

## Verification checklist

Exercise the behavior rather than only checking that activation succeeds:

| Test | Input | Expected observation |
| --- | --- | --- |
| Clear request | A task with goal, audience, and constraints | No clarification; final Kazakh prompt arrives. |
| High-value ambiguity | A jurisdiction-sensitive or budget-dependent task without that value | One or two specific Kazakh questions may be asked. The decision is model-based, so a question is not guaranteed. |
| Clarification resume | A concise answer to the question within 30 minutes | Stored original task resumes; final output arrives. |
| Superseding task | A clearly unrelated request while clarification is pending | Old session becomes `cancelled`; new task is processed. |
| Input rejection | `/start`, a sticker, or a voice note without caption | Kazakh message asks for meaningful text. |
| Caption | Media with a textual caption | Caption is processed; media itself is ignored. |
| Long output | A task likely to create a prompt longer than 3,600 characters | Result arrives as a `.txt` document. |

Inspect the Data Table and execution log after these tests. Remove test rows or wait for event-driven cleanup if they contain information you do not want retained.

## Troubleshooting

### The trigger does not receive messages

- Confirm the workflow is active, not merely saved.
- Check n8n's production webhook URL and HTTPS/reverse-proxy configuration.
- Ensure no other workflow or service is using the same bot token's webhook.
- In groups, review the bot's privacy mode; in channels, review membership and posting permissions.

### Data Table nodes are missing or incompatible

The export uses Data Table node type version `1.1`, including create-if-missing, row update/delete/get, and upsert. Update n8n to a release that recognizes the imported nodes. Do not replace these nodes with a different datastore unless you also preserve their matching, ordering, and lifecycle semantics.

### An OpenAI node rejects the model or options

First confirm account access and that the node is using the **Text → Generate a Model Response** operation. If the n8n node version cannot express the imported settings, update n8n. If the model ID is unavailable, use the adaptation guidance above and re-run the entire verification checklist.

### The bot asks a question, then treats the reply as a new request

The classifier intentionally prefers `new_request` when uncertain. Make the answer directly address the stored question, ideally with its number when two questions were asked. A classifier error or unparsable response also takes the new-request path.

### A temporary status message remains

Deletion is best effort and is configured to continue on failure. Check the Telegram credential, chat permissions, and the execution record. A successful final reply is not rolled back when status cleanup fails.

### Old table rows remain longer than the documented window

Expiry and purge are run only when a new Telegram update triggers the workflow. `expires_at` controls whether a pending session remains logically usable; it is not a scheduled deletion time. Non-pending rows are deleted after they are more than seven days old only during a later execution.

## Safe adaptation points

Common adaptations that preserve the architecture include:

- changing the Telegram-facing Kazakh status/error copy;
- substituting models in all relevant OpenAI nodes, followed by full testing;
- adjusting the 30-minute expiry in `Prepare Clarification Session` and documenting the new policy;
- adjusting the 3,600-character direct-delivery threshold below Telegram's applicable limit;
- editing the AI stage prompts while keeping their output contracts and parser expectations aligned.

Renaming nodes is riskier than it looks: n8n expressions reference nodes by name throughout the workflow. Update every expression and validate the imported graph if you rename one.

For material changes, follow [CONTRIBUTING.md](../CONTRIBUTING.md) and export a sanitized workflow rather than editing opaque JSON by hand.
