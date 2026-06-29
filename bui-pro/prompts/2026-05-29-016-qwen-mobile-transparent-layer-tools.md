Role: Qwen coding engineer.

Project: BUI Banner Pro in shared iCloud workspace:
~/Library/Mobile Documents/com~apple~CloudDocs/AI-Projects/current-project/bui-pro/

Task: Add mobile-accessible transparent background and layer separation tools.

Implement guidance:
- Add a mobile quick action button to make the canvas/export background transparent.
- Transparent background must remove existing background plate/image objects and set Fabric canvas background to null so PNG export preserves transparency.
- Add a mobile quick action for selected images/logos/design elements to create separated editable layers: background plate, underbase, selected image/artwork, and editable text label where useful.
- Keep desktop UX unchanged except safe existing controls can call the new functions.
- Layer separation should make it easier to isolate brand logo, background, image, and text layers in the Layers panel.
- Preserve existing copy, delete, lock/unlock, up/down mobile actions.
- Do not overwrite unrelated files.
- Run build/test and mobile browser QA after changes.

Return only: files changed, diff summary, QA result, next task.
