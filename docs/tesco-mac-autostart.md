# Automatic Tesco helper startup on macOS

The Tesco helper can run as a per-user macOS LaunchAgent. It starts when you log in and runs without a Terminal window. It is not a cloud service: the Mac must be awake, logged in, and have valid AWS credentials.

## Install

1. Stop the existing manual helper in Terminal with Ctrl+C. If it was suspended with Ctrl+Z, run `jobs -l`, resume it with `fg %N`, then Ctrl+C; alternatively stop its Node PID.
2. Update your checkout: `cd ~/e-calendar && git pull`.
3. Ensure dependencies are installed: `npm install` and `npm install --no-save playwright` if needed.
4. Confirm the configured profile works: `AWS_PROFILE=oast-cottage aws sts get-caller-identity`. If credentials have expired, authenticate separately before proceeding.
5. Run `zsh scripts/install-tesco-launchagent.sh`.

The installer uses the current Node.js executable, absolute project directory, `AWS_PROFILE=oast-cottage`, and region `eu-north-1`. It writes a LaunchAgent at `~/Library/LaunchAgents/uk.co.escapeaway.ecalendar.tesco-helper.plist` and logs under `~/Library/Logs/e-calendar/`.

## Verify

```sh
launchctl print gui/$(id -u)/uk.co.escapeaway.ecalendar.tesco-helper
tail -n 30 ~/Library/Logs/e-calendar/tesco-helper.log
```

Look for the line `Tesco local helper listening on http://127.0.0.1:47831`. Then use the calendar's Reconnect Tesco button. If the browser blocks the local request or interactive Tesco authentication cannot work in the LaunchAgent context, use the manual Terminal command instead. A LaunchAgent does not guarantee Chrome login prompts will appear in the foreground.

## Remove

```sh
zsh scripts/uninstall-tesco-launchagent.sh
```

AWS CLI login may still expire. The helper does not automatically refresh AWS authentication. Keep the loopback listener private; do not expose the port.
