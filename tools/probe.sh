#!/bin/bash
# Read-only snapshot of windows, desktops, work area and stacking order.
# Useful for diagnosing tiling, borders, overlays and hotkeys.
#
#   tools/probe.sh              one snapshot
#   tools/probe.sh --watch      re-snapshot every 2s (Ctrl-C to stop)
#   tools/probe.sh --raw        keep the full journal tail instead of just SNAP
#
# Installs the probe script into KWin's scripting loader, runs it, prints
# the output, then unloads it. It never changes window state.
set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PROBE="$ROOT/tools/probe.js"
WATCH=0
[ "${1:-}" = "--watch" ] && WATCH=1

if ! qdbus6 org.kde.KWin /KWin >/dev/null 2>&1; then
    echo "KWin scripting is not available (is Plasma running?)" >&2
    exit 1
fi

run_once() {
    local name="probe-$$-$(date +%s%N)"
    local mark
    mark=$(date '+%Y-%m-%d %H:%M:%S')
    qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "$PROBE" "$name" >/dev/null 2>&1
    qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.start >/dev/null 2>&1
    sleep 1
    qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "$name" >/dev/null 2>&1
    journalctl --user -u plasma-kwin_wayland --no-pager --since "$mark" 2>/dev/null \
        | grep 'SNAP' | sed -E 's/.*kwin_wayland\[[0-9]+\]: //'
}

if [ "$WATCH" = "1" ]; then
    trap 'qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript "probe-watch" >/dev/null 2>&1; exit 0' INT
    while true; do
        echo "=== $(date '+%H:%M:%S') ==="
        run_once
        sleep 2
    done
else
    run_once
fi
