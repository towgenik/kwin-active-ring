// Active Ring entry point. This file must stay the same from version to
// version: KWin caches the file a script starts with (always ui/main.qml)
// for as long as it runs. Code loaded through this Loader is not pinned
// that way, and tools/install.sh gives each version a folder of its own,
// recorded as BuildId, so every upgrade loads from a path KWin has never
// seen. Pattern adapted from HyprKwin (GPL-3.0-or-later).
import QtQuick
import org.kde.kwin

Loader {
    readonly property string build: /^[0-9]+$/.test(String(KWin.readConfig("BuildId", "") || ""))
        ? String(KWin.readConfig("BuildId", "")) : ""
    source: build ? "../build-" + build + "/ui/Ring.qml" : "Ring.qml"
    onStatusChanged: {
        if (status === Loader.Error && source.toString().indexOf("/build-") >= 0) {
            console.warn("ActiveRing: build " + build + " is missing, using the packaged copy");
            source = "Ring.qml";
        }
    }
}
