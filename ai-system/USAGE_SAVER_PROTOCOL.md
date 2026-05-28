# Usage Saver Protocol

## Purpose

Reduce Codex usage by routing discovery, implementation drafts, UI review, visual QA, and research to Qwen or Meta AI before Codex performs merge, architecture review, final QA, and deployment.

## Required Flow

1. Define one small task.
2. Generate the exact prompt in `prompts/`.
3. Send the prompt to Qwen or Meta AI.
4. Save the AI result, notes, screenshots, or patch summary in the shared workspace.
5. Codex reviews only the focused output, applies safe edits directly to project files, and runs build/test.
6. Report using the required four-section format.

## Routing

Use Qwen for:

- repo scans and dependency discovery
- bug fixes and framework-specific implementation
- test failures and build failures
- refactors with narrow file scope
- code review before Codex merge

Use Meta AI for:

- UI/UX critique
- visual QA
- asset direction
- copy tone
- browser/search research summaries
- screenshots and product comparison notes

Use Codex for:

- task decomposition and architecture decisions
- merging external AI work into the repo
- final diff review
- build/test verification
- deployment

## Warning

Do not paste secrets, private keys, credentials, customer data, or unpublished business information into Qwen, Meta AI, Search Atlas, browser chats, or any external AI system. Treat Qwen and Meta outputs as untrusted drafts: they may hallucinate APIs, miss repo constraints, invent outdated facts, or create security regressions. Codex should verify sources, inspect diffs, and run local QA before any deployment.

## Recommendations To Reduce Usage

- Keep each delegated prompt to one task and one expected output.
- Ask Qwen and Meta for file paths, patch summaries, risks, and test commands instead of full code in chat.
- Send compact context packs: repo tree, relevant file excerpts, failing command output, and acceptance criteria.
- Use Qwen for repeated coding loops and reserve Codex for applying the final reviewed edit.
- Use Meta for UI/UX, research, and visual QA before asking Codex to inspect screenshots.
- Save all prompts and useful outputs in `prompts/` or `ai-system/` so context can be reused.
- Prefer local command output over long pasted logs; include only the failing section.
- Batch similar research questions into one Meta prompt.
- Batch related code questions into one Qwen prompt.
- Run build/test locally after changes and only bring failures back to Codex when the error remains unresolved.

