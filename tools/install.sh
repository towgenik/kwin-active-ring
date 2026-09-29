#!/bin/bash
# Install (or upgrade) Active Ring for the current user and enable it.
#
#   tools/install.sh            install/upgrade, enable, (re)load
#   tools/install.sh --no-enable
#
# Adapted from HyprKwin's tools/install.sh (GPL-3.0-or-later, by dgbooth).
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ENABLE=1
[ "${1:-}" = "--no-enable" ] && ENABLE=0

if kpackagetool6 --type=KWin/Script --show active-ring >/dev/null 2>&1; then
    kpackagetool6 --type=KWin/Script --upgrade "$ROOT/package"
else
    kpackagetool6 --type=KWin/Script --install "$ROOT/package"
fi

if [ "$ENABLE" = "1" ]; then
    kwriteconfig6 --file kwinrc --group Plugins --key active-ringEnabled true
fi

INSTALLED="${XDG_DATA_HOME:-$HOME/.local/share}/kwin/scripts/active-ring"
BUILD_ID="$(date +%s%N)"
printf 'var BUILD_ID = "%s";\n' "$BUILD_ID" > "$INSTALLED/contents/code/build.js"
# KWin caches a script's code by file path for as long as it runs, so this
# version also goes into a folder of its own, which the entry point
# (ui/main.qml) loads. That is what lets an upgrade apply without logging out.
mkdir -p "$INSTALLED/contents/build-$BUILD_ID"
cp -r "$INSTALLED/contents/ui" "$INSTALLED/contents/code" "$INSTALLED/contents/build-$BUILD_ID/"
kwriteconfig6 --file kwinrc --group Script-active-ring --key BuildId "$BUILD_ID"

running_this_build() {
    # The script logs its build as it starts, but the journal can lag a little.
    for _ in $(seq 1 40); do
        latest=$(journalctl --user -b --since "2 minutes ago" 2>/dev/null | grep -o "RING_BUILD [0-9a-z]*" | tail -1)
        [ "$latest" = "RING_BUILD $BUILD_ID" ] && return 0
        sleep 0.25
    done
    return 1
}

if qdbus6 org.kde.KWin /KWin >/dev/null 2>&1; then
    kwriteconfig6 --file kwinrc --group Script-active-ring --key ReloadedAt "$(date +%s)"
    qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript active-ring >/dev/null || true
    qdbus6 org.kde.KWin /KWin org.kde.KWin.reconfigure
    sleep 1
    kwriteconfig6 --file kwinrc --group Script-active-ring --key ReloadedAt --delete
    if [ "$(qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded active-ring)" != "true" ]; then
        if [ "$ENABLE" = "1" ]; then
            echo "Active Ring was installed but did not start; check: journalctl --user -b | grep -i 'Ring:'"
            exit 1
        fi
    elif ! running_this_build; then
        cat <<'STALE'
Active Ring is running, but KWin is still using a cached copy of a previous
version. Log out and back in (or restart KWin) to run the version just
installed. From then on, upgrades apply straight away without logging out.
STALE
    else
        echo "Active Ring is running the version just installed (no need to log out)."
    fi
fi
