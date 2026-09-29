#!/bin/bash
# Toggle Active Ring debugging and capture snapshots.
#
#   tools/ring-debug.sh on        enable Debug, reload KWin scripts
#   tools/ring-debug.sh verbose   enable Debug + DebugVerbose
#   tools/ring-debug.sh off       disable both
#   tools/ring-debug.sh watch     follow Ring: log lines
#   tools/ring-debug.sh snapshot [file]   capture one window/border snapshot
set -euo pipefail

GROUP="Script-active-ring"
LOGDIR="${XDG_DATA_HOME:-$HOME/.local/share}/kwin-active-ring-debug"
mkdir -p "$LOGDIR"

case "${1:-}" in
    on)
        kwriteconfig6 --file kwinrc --group "$GROUP" --key Debug true
        kwriteconfig6 --file kwinrc --group "$GROUP" --key DebugVerbose false
        qdbus6 org.kde.KWin /KWin org.kde.KWin.reconfigure
        echo "Ring debug ON (DebugVerbose off). Watch with: $0 watch"
        ;;
    verbose)
        kwriteconfig6 --file kwinrc --group "$GROUP" --key Debug true
        kwriteconfig6 --file kwinrc --group "$GROUP" --key DebugVerbose true
        qdbus6 org.kde.KWin /KWin org.kde.KWin.reconfigure
        echo "Ring debug VERBOSE on. Expect a firehose; use briefly."
        ;;
    off)
        kwriteconfig6 --file kwinrc --group "$GROUP" --key Debug false
        kwriteconfig6 --file kwinrc --group "$GROUP" --key DebugVerbose false
        qdbus6 org.kde.KWin /KWin org.kde.KWin.reconfigure
        echo "Ring debug OFF."
        ;;
    watch)
        exec journalctl --user -u plasma-kwin_wayland -f | grep --line-buffered -E 'Ring:|RING_BUILD'
        ;;
    snapshot)
        OUT="${2:-$LOGDIR/snapshot-$(date +%Y%m%d-%H%M%S).log}"
        journalctl --user -u plasma-kwin_wayland --no-pager --since "-2min" > "$OUT"
        echo "Snapshot saved to $OUT"
        ;;
    *)
        echo "Usage: $0 {on|verbose|off|watch|snapshot [file]}" >&2
        exit 1
        ;;
esac
