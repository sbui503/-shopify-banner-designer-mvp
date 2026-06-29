Role: Qwen coding engineer.

Project: BUI Banner Pro white-label designer.

Task: Review and advise on a safe patch for three issues: mobile top toolbar controls overlap around QR/zoom/export; admin primary color does not visibly update the UI; default white-label primary color should be blue. Keep the single-file app structure, avoid rewriting feature code, and preserve existing desktop UX.

Implementation direction: introduce theme CSS variables, wire admin color save to update those variables, default to blue, and make the mobile header use compact modern controls with no overlapping text or icons.

Deliverable requested from Qwen: concise implementation notes and risks only; Codex will patch and QA.
