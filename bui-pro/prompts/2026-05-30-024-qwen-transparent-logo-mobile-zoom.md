Role: Qwen frontend engineer.

Project: BUI Banner Pro white-label cannabis print-shop designer.

Task: Reduce Codex work by proposing the safest scoped implementation for two changes: all brand logo assets should behave like transparent-background logos when inserted into the editor, including JPG/flat-background logo sources where possible; mobile/iPhone should default to 80% zoom because the 80% viewport fit is better than 90%/100%.

Implementation guidance:
- Do not scrape or download new logos.
- Use existing brand logo manifest and image URLs.
- Preserve true PNG transparency.
- For flat logo backgrounds, use browser-side canvas processing to remove the dominant corner/edge color with a conservative tolerance and fall back to original image if CORS or processing fails.
- Mark UI copy as "Auto transparent" rather than claiming source files are permanently transparent.
- Keep desktop zoom at 100%.
- Run build/test and visual/geometry QA.

Deliverable requested from Qwen: concise implementation recommendation and risks only; Codex will edit and verify.
