#!/bin/bash
# Record every global shortcut KWin actually receives, for a fixed window.
#
# This exists because synthetic key injection cannot prove a binding on this
# machine:
#   * ydotool  - uinput path; Meta+Shift+<digit> never arrives (0/10 in test)
#   * cua-driver - needs the xdg-desktop-portal RemoteDesktop interface, which
#                  is stripped from kde.portal on this box, so libei never starts
#   * wtype    - zwp_virtual_keyboard_manager_v1; KWin does not expose that global
# So the only remaining path is a real keyboard, captured here.
#
#   tools/keywatch.sh 20              # watch for 20s
#   tools/keywatch.sh 20 2>&1 | tee /tmp/kw.log
#
# Start it, then press the keys you want to check. Every press prints the
# component and action name, so you can tell "not bound at all" (nothing
# printed) from "bound to the wrong action" (wrong name printed).
set -uo pipefail

SECS="${1:-20}"
OUT="${2:-/dev/stdout}"

if ! qdbus6 org.kde.KWin /KWin >/dev/null 2>&1; then
    echo "KWin is not reachable (is Plasma running?)" >&2
    exit 1
fi

# A sentinel action lets us tell "monitor never started" from "no keys pressed".
echo "watching ${SECS}s -- press your shortcut now" > "$OUT"

timeout "$SECS" dbus-monitor --session \
    "type='signal',interface='org.kde.kglobalaccel.Component',member='globalShortcutPressed'" \
    2>/dev/null \
| awk '
    /^[[:space:]]*string "/ {
        line = $0
        sub(/^[[:space:]]*string "/, "", line)
        sub(/"$/, "", line)
        if (line ~ /^:[0-9]/) next          # unique bus name, not an action
        n++
        s[n] = line
    }
    END {
        for (i = 1; i + 1 <= n; i += 2) printf "  %s/%s\n", s[i], s[i+1]
    }
' >> "$OUT"

echo "--- done ---" >> "$OUT"
