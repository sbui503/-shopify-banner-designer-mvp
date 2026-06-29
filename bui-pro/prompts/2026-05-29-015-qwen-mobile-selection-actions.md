Role: Qwen coding engineer.

Project: BUI Banner Pro, single-file Fabric.js label and packaging designer in the shared iCloud workspace:
~/Library/Mobile Documents/com~apple~CloudDocs/AI-Projects/current-project/bui-pro/

Task: Make the most common object actions easy on mobile without changing the desktop workflow.

Implement guidance:
- Add persistent mobile-first quick actions for the current canvas selection: Copy, Delete, Lock, Unlock, Up, Down, Edit Text, and Layers.
- Keep the existing desktop sidebar and property controls intact.
- The quick actions must be reachable without opening the right drawer.
- Buttons must be large enough for touch, have icon-first labels, and stay clear of the canvas and footer.
- Empty-selection state should show helpful creation shortcuts like Text, Shape, Upload, Assets, and 3D instead of disabled clutter.
- When the selection changes, update the quick action labels and disabled states.
- Respect existing Fabric.js object locking, activeSelection delete/duplicate behavior, history saving, and layer panel rendering.
- Do not overwrite unrelated files.
- Run npm build/test after changes.

Return only: files changed, diff summary, QA result, next task.
