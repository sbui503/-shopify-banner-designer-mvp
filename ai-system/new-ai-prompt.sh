#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'Usage: %s <qwen|meta> "Task title" "Task details"\n' "$0" >&2
}

if [ "$#" -lt 3 ]; then
  usage
  exit 2
fi

role="$1"
title="$2"
details="$3"

case "$role" in
  qwen|meta) ;;
  *)
    usage
    exit 2
    ;;
esac

workspace="${AI_PROJECT_WORKSPACE:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/AI-Projects/current-project}"
prompts_dir="$workspace/prompts"
mkdir -p "$prompts_dir"

slug="$(printf '%s' "$title" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' | cut -c 1-70)"
if [ -z "$slug" ]; then
  slug="task"
fi

stamp="$(date '+%Y-%m-%d-%H%M%S')"
prompt_file="$prompts_dir/${stamp}-${role}-${slug}.md"

if [ -e "$prompt_file" ]; then
  printf 'Refusing to overwrite existing prompt: %s\n' "$prompt_file" >&2
  exit 1
fi

if [ "$role" = "qwen" ]; then
  role_line="You are Qwen. Act as the coding and repository engineering assistant for this project."
  role_scope="coding, repo scan, fixes, framework work, build/test diagnosis"
else
  role_line="You are Meta AI. Act as the UI/UX, research, assets, and visual QA assistant for this project."
  role_scope="UI/UX critique, assets, research, browser/search review, visual QA"
fi

cat > "$prompt_file" <<EOF
# ${role} Prompt - ${title}

${role_line}

Workspace:
\`${workspace}\`

Role scope:
${role_scope}

Task:
${details}

Rules:
- No full code in chat unless explicitly required for a tiny snippet.
- Prefer direct file-path recommendations, patch summaries, and exact commands.
- Do not restart the project.
- Do not overwrite unrelated files.
- Identify any files that should be backed up before major edits.
- Call out security, data, dependency, and deployment risks.
- Keep output compact enough for Codex to review cheaply.

Return only:
- files to inspect or change
- proposed diff summary
- QA/build/test commands
- risks or blockers
- next task
EOF

printf '%s\n' "$prompt_file"

