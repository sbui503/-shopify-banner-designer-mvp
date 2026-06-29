Role: Qwen as coding, scraper, manifest, and editor integration assistant.

Task: Scrape public Weedmaps brand listing pages 1-100 for brand logo image URLs and integrate them into BUI Banner Pro as logo assets.

Use this exact guidance:
- Work only inside the BUI Pro project.
- Pages: https://weedmaps.com/brands/all?page=1 through page=100.
- Extract URL-only public logo references from page HTML/Next.js data.
- Do not download, cache, trace, or rehost image binaries.
- Preserve source URL, page number, brand name, slug, logo URL, image format, transparent/background hints, and licenseStatus.
- Mark scraped logo assets as verbal_approval_pending_written.
- Add a Logo category to the asset/template experience.
- Logos should be drag/drop, resizable, layer-managed, and color-filterable in the canvas.
- Text generated from brand names must be editable Fabric.js text, using closest available fonts only. Do not recreate trademarked logos as exact production-ready clones without written permission.
- Keep desktop UX stable and add mobile-friendly search/filter batches.
- Run build/test and browser QA.

Expected output from Qwen:
- Files changed.
- Scrape count and manifest fields.
- Editor integration summary.
- QA checklist and legal/performance risk notes.
