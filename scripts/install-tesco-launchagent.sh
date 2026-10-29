#!/bin/zsh
set -euo pipefail
LABEL="uk.co.escapeaway.ecalendar.tesco-helper"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "Node.js not found. Install Node.js and retry." >&2
  exit 1
fi
if [[ ! -d "$PROJECT_DIR/node_modules" ]]; then
  echo "Run npm install in $PROJECT_DIR first." >&2
  exit 1
fi
AGENTS_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="$HOME/Library/Logs/e-calendar"
PLIST="$AGENTS_DIR/$LABEL.plist"
mkdir -p "$AGENTS_DIR" "$LOG_DIR"
# Use an absolute node path and project working directory; launchd has a minimal PATH.
# The AWS CLI profile must already have working credentials.
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$PROJECT_DIR/scripts/tesco-local-helper.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>$PROJECT_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>AWS_PROFILE</key><string>oast-cottage</string>
    <key>AWS_REGION</key><string>eu-north-1</string>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key>
  <dict><key>SuccessfulExit</key><false/></dict>
  <key>StandardOutPath</key><string>$LOG_DIR/tesco-helper.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/tesco-helper-error.log</string>
</dict>
</plist>
EOF
plutil -lint "$PLIST"
UID_NOW="$(id -u)"
launchctl bootout "gui/$UID_NOW/$LABEL" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$UID_NOW" "$PLIST"
launchctl enable "gui/$UID_NOW/$LABEL"
launchctl kickstart -k "gui/$UID_NOW/$LABEL"
echo "Installed $LABEL. It will start when you log in."
echo "Status: launchctl print gui/$UID_NOW/$LABEL"
echo "Logs: $LOG_DIR/tesco-helper.log"
echo "If port 47831 is already in use, stop the manually started helper (Ctrl+C) and run this installer again."
