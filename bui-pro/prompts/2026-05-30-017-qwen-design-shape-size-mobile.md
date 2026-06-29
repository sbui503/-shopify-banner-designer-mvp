Role: Qwen coding engineer.

Project: BUI Banner Pro in shared iCloud workspace:
~/Library/Mobile Documents/com~apple~CloudDocs/AI-Projects/current-project/bui-pro/

Task: Make Design easier to access on mobile, add expanded shape options, custom shape upload, and custom design size controls.

Implement guidance:
- Make Design a main mobile action in the quick rail so users can get back to templates/design tools without hunting through tabs.
- Add shape choices matching the provided reference: rectangle with rounded corners, square with rounded corners, circle, oval, arch, hexagon, heart, starburst, lollipop, and custom.
- Shapes should be inserted as editable Fabric objects where practical, with stable names and selected after insertion.
- Add a custom shape upload entry that accepts SVG or image files and adds it as an editable/resizable canvas object.
- Add custom size controls for width and height so users can set the design/canvas size manually.
- Keep the desktop workflow intact.
- Do not overwrite unrelated files.
- Run build/test and mobile QA after edits.

Return only: files changed, diff summary, QA result, next task.
