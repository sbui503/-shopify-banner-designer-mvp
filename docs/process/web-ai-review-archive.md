# Web AI Review Archive Process

Use this project process whenever we ask Qwen, Meta AI, Gemini, ChatGPT, or other web AI reviewers to critique a page, workflow, dashboard, guide, or UX decision.

## Rules

- Web UI first. Do not start with CLI or connectors unless explicitly requested or the web UI is blocked and a configured local client is already known to work.
- Keep prompts short: 1-4 sentences, under 500 characters when possible.
- Send the same prompt to every reviewer.
- Save prompt, code, assets, responses, screenshots, and blockers to iCloud.
- Do not paste API keys, cookies, order secrets, payment data, browser tokens, or customer private data into AI reviewers.
- If blocked by login/CAPTCHA/quota/seat/automation, save a status note and move on.

## Standard Prompt

```text
Review this [page/workflow]. Make it step-by-step, bilingual EN/VI, clear for a 7-year-old, not screenshot-heavy. Cover [key topics]. Return 10 concrete fixes.
```

## iCloud Folder

```text
~/Library/Mobile Documents/com~apple~CloudDocs/TSBanner/AI Reviews/YYYY-MM-DD-HHMM-topic/
```

Subfolders:

```text
prompts/
code/
assets/
responses/
screenshots/
summary/
```

## Required Report

```text
Prompt path:
Archive path:
Qwen:
Meta:
Gemini:
ChatGPT:
Implemented:
Verified:
Deployed:
```
