# AI Project Workspace

Shared workspace:

`~/Library/Mobile Documents/com~apple~CloudDocs/AI-Projects/current-project/`

This project is organized to reduce Codex usage by delegating first-pass work to Qwen and Meta AI.

## Operating Rule

Before each task, create and save an exact prompt in `prompts/`.

Use:

```sh
./ai-system/new-ai-prompt.sh qwen "Task title" "Specific task details"
./ai-system/new-ai-prompt.sh meta "Task title" "Specific task details"
```

Then send the generated prompt to the assigned AI and save its useful output back into the workspace before Codex reviews or merges anything.

## Roles

- Qwen: coding, repo scan, fixes, framework work.
- Meta AI: UI/UX, assets, research, visual QA.
- Codex: merge, architecture, final QA, deployment.

## Reporting Format

After each task, report only:

- files changed
- diff summary
- QA result
- next task

