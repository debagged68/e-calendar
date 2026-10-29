#!/bin/zsh
set -euo pipefail
LABEL="uk.co.escapeaway.ecalendar.tesco-helper"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
rm -f "$PLIST"
echo "Removed Tesco helper automatic startup. Logs were preserved in ~/Library/Logs/e-calendar/."
