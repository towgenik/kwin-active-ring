// Host for the overlay ring pool. Border drawing (Border.qml + BorderStrip.qml)
// is lifted from HyprKwin; the driver (code/borders.js) is a minimal
// tiler-agnostic tracker that supplies {id, x, y, width, height, active}.
import QtQuick
import org.kde.kwin as KWin
import "../code/borders.js" as BordersDriver

Item {
    id: root

    property var borderObjects: ({})
    property int revision: 0
    property bool shuttingDown: false
    property bool overlaysHidden: false
    property var driver: null

    Component {
        id: borderComponent
        Border {}
    }

    function dropMissing(seen) {
        for (var id in borderObjects) {
            if (!seen[id]) {
                try { borderObjects[id].hideAll(); } catch (e) {}
                try { borderObjects[id].destroy(); } catch (e) {}
                delete borderObjects[id];
            }
        }
    }

    function hideOverlays() {
        for (var id in borderObjects) {
            try { borderObjects[id].hideAll(); } catch (e) {}
        }
    }

    // list: [{id, x, y, width, height, active}], cfg: plain object from driver
    function syncBorders(list, cfg) {
        revision++;
        var seen = {};
        for (var i = 0; i < list.length; i++) {
            var entry = list[i];
            seen[entry.id] = true;
            var b = borderObjects[entry.id];
            if (!b) {
                b = borderComponent.createObject(root);
                borderObjects[entry.id] = b;
            }
            b.frame = Qt.rect(entry.x, entry.y, entry.width, entry.height);
            b.active = entry.active;
            b.borderWidth = cfg.borderSize;
            b.radius = cfg.borderRadius;
            b.activeFromTheme = cfg.activeSource === 0;
            b.inactiveFromTheme = cfg.inactiveSource === 0;
            b.activeColor = cfg.activeColor;
            b.activeColor2 = cfg.activeColor2;
            b.activeGradient = cfg.activeSource === 2;
            b.inactiveColor = cfg.inactiveColor;
            b.gradientAngle = cfg.gradientAngle;
            b.spinSpeed = cfg.gradientSpin;
            b.overlaysHidden = overlaysHidden;
            b.revision = revision;
        }
        dropMissing(seen);
    }

    Timer {
        id: decorationTimer
        interval: 0
        onTriggered: if (root.driver && !root.shuttingDown) root.driver.updateBorders()
    }

    Component.onCompleted: {
        console.warn("ACTIVERING_BUILD 0.1.0");
        driver = BordersDriver.createDriver({
            workspace: Workspace,
            readConfig: function (key, fallback) { return KWin.readConfig(key, fallback); },
            log: function (msg) { console.warn(msg); },
            scheduleBorders: function () { decorationTimer.restart(); },
            ui: {
                setBorders: function (list, cfg) { root.syncBorders(list, cfg); },
            },
        });
        driver.start();
    }

    Component.onDestruction: {
        shuttingDown = true;
        hideOverlays();
    }
}
