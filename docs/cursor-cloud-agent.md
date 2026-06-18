# Cloud Agent Setup for this Repo

This repo is configured with a shared Cursor/LM Studio local contract.

Quick start:

```bash
npm run setup:local
npm run dev:local
```

If `setup:local` or `dev:local` is missing, use project scripts from `package.json`:

```bash
npm install
npm run lint
npm run build
npm run dev
```

## Files used by Cursor and local AI
- `.cursorrules`
- `README.md`
- `docs/local-ai-runbook.md` (when present)
- `local-runner-profile.json` (when present)
- `.env.example` and `.env.local`

