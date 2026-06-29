# Qwen Prompt - Weedmaps URL Scrape Export

You are Qwen. Act as the coding and repo engineering assistant for BUI Pro.

Workspace:
`/Users/simba/Library/Mobile Documents/com~apple~CloudDocs/AI-Projects/current-project/bui-pro`

Task:
The user says they have verbal approval to collect Weedmaps strain hero image URLs. Add a URL-only scraper/export path that collects rendered public image URLs from `https://weedmaps.com/strains?page=N`, pages 1 through 588, and converts them into the existing BUI Pro strain hero manifest format. Do not download, cache, rehost, or modify image binaries. Store source URL, page number, image URL, normalized high-res preview URL, and permission metadata. Mark license status as `verbal_approval_pending_written` unless a written license is provided.

Rules:
- No full code in chat.
- Directly edit files.
- Do not store cookies, login tokens, or account credentials.
- Rate-limit page loads.
- Keep generated scrape files out of Vercel deployment unless intentionally imported as URL manifests.
- Run build/test after changes.

Return only:
- files changed
- diff summary
- QA result
- next task
