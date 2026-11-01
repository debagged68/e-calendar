# Tesco helper startup on macOS

The per-user LaunchAgent starts the browser helper when you log into your Mac. The Mac must be awake with Google Chrome and the local browser driver installed. **No AWS CLI/profile/login is required.**

## Update or install

Stop any manually started old helper with Ctrl+C, then:

```sh
cd ~/e-calendar
git pull
npm install
npm install --no-save playwright
zsh scripts/install-tesco-launchagent.sh
```

The installer replaces/restarts `uk.co.escapeaway.ecalendar.tesco-helper` using the current Node executable and project directory. It no longer sets `AWS_PROFILE` or `AWS_REGION`. It does not modify or renew your existing AWS login.

Open Reconnect Tesco in the signed-in calendar once Amplify has deployed the update. Helper v2 handles only Tesco browser authentication. The hosted app owns reading/writing Secrets Manager. See [the reconnect design](tesco-reconnect.md) for the handoff and server permissions.

## Verify

```sh
launchctl print gui/$(id -u)/uk.co.escapeaway.ecalendar.tesco-helper
tail -n 30 ~/Library/Logs/e-calendar/tesco-helper.log
```

Look for `Tesco helper v2` and `no local AWS login required`. The app refuses to start older helpers. A LaunchAgent cannot remove Tesco's own occasional login requirements or browser local-network restrictions.

## Remove

```sh
zsh scripts/uninstall-tesco-launchagent.sh
```

Keep port 47831 on loopback; do not expose or forward it.
