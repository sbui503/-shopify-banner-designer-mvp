# iMessage Bug Monitor

This local monitor watches the Doan/Duy Messages group and writes new incoming bug reports to:

```text
logs/imessage-bug-reports.jsonl
```

It does not send anything automatically. Use these replies in the group:

```text
Tsdev: Cảm ơn anh, để em kiểm tra.
```

```text
Tsdev: Đã sửa xong rồi anh, anh thử lại giúp em.
```

## Required Mac Permission

macOS protects Messages. Grant Full Disk Access to the app running this repo:

1. Open `System Settings`.
2. Go to `Privacy & Security`.
3. Open `Full Disk Access`.
4. Enable the app running Codex, Terminal, or iTerm.
5. Quit and reopen that app.

## Commands

Find the Doan/Duy group:

```bash
node scripts/imessage-bug-monitor.mjs --find
```

Check once for new incoming reports:

```bash
node scripts/imessage-bug-monitor.mjs --once
```

Watch continuously:

```bash
node scripts/imessage-bug-monitor.mjs --watch
```

Start only when a text arrives:

```bash
node scripts/install-imessage-launchagent.mjs --install
```

That installs a macOS LaunchAgent using `WatchPaths` on the Messages database. When Messages receives or stores a message, macOS starts the monitor once, and the monitor filters to only the Doan/Duy group.

If the LaunchAgent log says `authorization denied`, add these binaries to Full Disk Access too:

```text
/Users/siabui/.nvm/versions/node/v20.20.2/bin/node
/usr/bin/sqlite3
```

In the file picker, press `Command + Shift + G`, paste the path, then add it. After that, rerun the install command so launchd kickstarts the job again.

Check LaunchAgent status:

```bash
node scripts/install-imessage-launchagent.mjs --status
```

Remove it:

```bash
node scripts/install-imessage-launchagent.mjs --uninstall
```

Print the short Vietnamese replies:

```bash
node scripts/imessage-bug-monitor.mjs --reply thanks
node scripts/imessage-bug-monitor.mjs --reply fixed
```

## Notes

- Default monitored numbers are `16692103351` and `16692103374`.
- Override numbers with `IMESSAGE_MONITOR_IDS`.
- Attachments are flagged as `[attachment or image]`; upload screenshots here when needed.
- LaunchAgent triggers on any Messages database change, then filters to Doan/Duy. macOS does not expose a private, per-chat iMessage trigger.
