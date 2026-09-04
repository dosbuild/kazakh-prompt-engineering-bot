# Security policy

## Reporting

Please report suspected vulnerabilities privately to the repository maintainer through GitHub's **Security → Report a vulnerability** flow when it is enabled. If private reporting is unavailable, open an issue that requests a private contact channel without including exploit details or sensitive data.

Do not publish active API keys, Telegram bot tokens, webhook URLs containing secrets, private chat content, Data Table rows, or unredacted n8n execution data.

## Scope

Reports about secret exposure in this repository, unsafe workflow data handling, state-routing flaws, or a reproducible way for Telegram content to escape its intended text-processing role are in scope.

The security and availability of hosted n8n, Telegram, and OpenAI services are governed by their operators. Model output quality, prompt injection that only changes the generated text, and deployment hardening omitted by an operator are not represented here as security guarantees, though concrete risk-reduction improvements are welcome.

This project currently publishes a workflow artifact rather than versioned server releases. Security fixes will be documented in the repository history and affected documentation.
