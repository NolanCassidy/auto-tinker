# Security

Auto-Tinker handles private developer history and may direct coding agents, so treat its workspace as sensitive.

## Supported version

The current `main` branch is the supported POC version.

## Report a vulnerability

Do not open a public issue containing private history, credentials, paths, or exploit details. Contact the repository owner through GitHub with a minimal description and coordinate a private disclosure channel.

## Local viewer boundary

The POC viewer is intended to run on a trusted local machine. Its development and production scripts bind to `127.0.0.1`, and every `/api` handler independently rejects non-loopback Host headers and cross-origin browser requests. These controls reduce accidental LAN exposure and DNS-rebinding risk; they are not hosted-service authentication. Do not expose the viewer to the public internet without adding authentication, authorization, tenant isolation, encrypted storage, rate limiting, and a separate hosted storage adapter.

The viewer does not execute agent skills, shell commands, Git operations, or GitHub mutations. It only reads local state, performs narrowly validated metadata updates, and generates prompts for the user to copy into an agent chat.

Reviewing a public-story draft in the viewer is writing-review metadata only. It cannot approve repository publication. Repository visibility remains a distinct, chat-invoked workflow with its own durable approval policy and remote verification.

## Secret handling

- Never store tokens, passwords, private keys, signed URLs, or raw environment values in `.auto-tinker/`.
- Record only whether an integration is available and where the user expects credentials to be managed.
- Keep `.auto-tinker/`, generated experiments, and derived SQLite indexes out of this public repository.
- Review private journals independently before producing a public story.
