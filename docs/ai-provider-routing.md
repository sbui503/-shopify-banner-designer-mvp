# AI Provider Routing

Goal: preserve Codex usage for code changes, Shopify edits, deployment, and QA while using lower-cost external models for first-pass triage when available.

## Routing Rules

- Codex: code edits, Shopify/theme changes, production decisions, QA, deployment, final verification.
- Qwen: Vietnamese bug triage, translation, first-pass likely-cause analysis, checklist drafting.
- Meta.AI: visual/design brainstorming and alternate layout ideas. Use manually in browser unless a supported API is added.
- Local fallback: if no external provider is configured, use deterministic local triage.

Do not send private customer data, credentials, Shopify admin data, or unpublished assets to external providers unless explicitly approved.

## Bug Report Flow

1. iMessage monitor imports new Doan/Duy reports into `logs/imessage-bug-reports.jsonl`.
2. Run Qwen/local triage:

```bash
node scripts/ai-triage-router.mjs --file logs/imessage-bug-reports.jsonl
```

3. Codex inspects the app, fixes the issue, runs QA, and deploys when appropriate.
4. Reply in Vietnamese:

```text
Tsdev: Cảm ơn anh, để em kiểm tra.
```

```text
Tsdev: Đã sửa xong rồi anh, anh thử lại giúp em.
```

## Qwen Options

OpenAI-compatible Qwen endpoint:

```bash
export AI_TRIAGE_PROVIDER=qwen-openai
export QWEN_OPENAI_BASE_URL="https://YOUR_QWEN_OPENAI_COMPATIBLE_BASE_URL"
export QWEN_API_KEY="YOUR_KEY"
export QWEN_MODEL="qwen-plus"
node scripts/ai-triage-router.mjs --file logs/imessage-bug-reports.jsonl
```

Local Ollama Qwen:

```bash
export AI_TRIAGE_PROVIDER=qwen-ollama
export OLLAMA_HOST="http://127.0.0.1:11434"
export OLLAMA_MODEL="qwen2.5-coder:7b"
node scripts/ai-triage-router.mjs --file logs/imessage-bug-reports.jsonl
```

## Meta.AI Manual Handoff

Meta.AI does not have a project-configured API in this repo. Generate a safe prompt to paste manually:

```bash
node scripts/ai-triage-router.mjs --provider meta-manual --file logs/imessage-bug-reports.jsonl
```

Use Meta.AI for visual/design direction only. Codex must still verify implementation and QA locally.
