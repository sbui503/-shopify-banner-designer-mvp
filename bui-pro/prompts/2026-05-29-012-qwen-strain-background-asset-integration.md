Role: Qwen as coding/repo implementation assistant.

Task: Integrate the generated Weedmaps strain hero URL manifest into BUI Banner Pro as background assets without downloading image binaries or breaking the existing editor.

Use this exact guidance:
- Work only inside the BUI Pro project.
- Keep the existing desktop UI behavior stable.
- Add the URL manifest as a searchable background library, not as thousands of always-rendered DOM nodes.
- Load from data/strain-hero-manifest.generated.json.
- Keep URL-only records and preserve licenseStatus values.
- Apply selected strain images as non-selectable canvas backgrounds with cover-fit scaling.
- Avoid importing all 10,610 records into the general asset grid at once on mobile.
- Keep the generated raw URL export out of deployment.
- Run build/test after changes.

Expected output from Qwen:
- Files to change.
- Any performance risk.
- QA checklist.
