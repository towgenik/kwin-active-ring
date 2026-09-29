// Active Ring host: owns the overlay Border objects and feeds them from
// the tracker. Adapted from HyprKwin's HyprKwin.qml syncBorders/dropMissing
// (GPL-3.0-or-later, by dgbooth), trimmed to borders only.
import QtQuick
import org.kde.kwin
import "../code/borders.js" as Borders
import "../code/geom.js" as Geom
import "../code/build.js" as Build

Item {
    id: root

    property var tracker: null
    // Bumped on every update: overlays re-check whether they should be on
    // screen, so one that was closed behind our back comes back.
    property int revision: 0
    // Once KWin starts shutting down, showing a window would build a KWin
    // window against a half-destroyed Workspace and crash the compositor.
    property bool shuttingDown: false
    property var style: ({})

    // One overlay set per window, keyed by id. Pooling them by index would
    // make the border slide across the screen when focus moves to another
    // window; keyed this way a border only ever follows its own window, and
    // focus changes simply hide one and show another.
    property var borderObjects: ({})
    property int bordersShown: 0
    // Fullscreen effects — and the slide animation a touchpad gesture
    // drives between desktops — paint their own view of every window, and
    // our strips (which live on all desktops, so the compositor never moves
    // them along) must not float over it. KWin tells scripts nothing when
    // one starts, so this has to ask, following HyprKwin's effectTimer
    // pattern: poll Workspace.isEffectActive while borders are on screen.
    property bool effectActive: false
    readonly property var hideEffects: ["slide", "overview", "windowview", "cube", "desktopgrid", "tileseditor", "expo"]

    Component { id: borderComponent; Border {} }

    function dropMissing(map, seen) {
        for (const key in map) {
            if (seen[key]) continue;
            map[key].hideAll();
            map[key].destroy();
            delete map[key];
        }
    }

    function syncBorders(list, cfg) {
        style = cfg;
        revision++;
        bordersShown = list.length;
        const seen = {};
        for (const entry of list) {
            seen[entry.id] = true;
            let border = borderObjects[entry.id];
            if (!border) {
                border = borderComponent.createObject(root, {
                    overlaysHidden: Qt.binding(() => root.effectActive || root.shuttingDown),
                });
                borderObjects[entry.id] = border;
            }
            border.frame = entry;
            border.active = entry.active;
            border.borderWidth = cfg.borderSize || 0;
            border.radius = cfg.borderRadius || 0;
            border.activeFromTheme = cfg.activeBorderSource === 0;
            border.activeGradient = cfg.activeBorderSource === 2;
            border.activeColor2 = cfg.activeBorderColor2 || "#00ff99";
            border.gradientAngle = cfg.borderGradientAngle || 0;
            border.spinSpeed = cfg.borderGradientSpin || 0;
            border.inactiveFromTheme = cfg.inactiveBorderSource === 0;
            border.activeColor = cfg.activeBorderColor || "#33ccff";
            border.inactiveColor = cfg.inactiveBorderColor || "#595959";
            border.overlaysHidden = root.effectActive || root.shuttingDown;
            border.revision = revision;
        }
        dropMissing(borderObjects, seen);
    }

    function hideOverlays() {
        for (const key in borderObjects) borderObjects[key].hideAll();
    }

    Timer {
        id: decorationTimer
        interval: 0
        onTriggered: { if (root.tracker) root.tracker.update(); }
    }

    Timer {
        id: effectTimer
        interval: 150
        running: root.tracker !== null && root.bordersShown > 0
        repeat: true
        onTriggered: {
            var active = false;
            for (var i = 0; i < root.hideEffects.length; i++) {
                try {
                    if (Workspace.isEffectActive(root.hideEffects[i])) { active = true; break; }
                } catch (e) { /* unknown effect id */ }
            }
            root.effectActive = active;
        }
    }

    // HyprKwin lesson (its areaTimer): events can miss a state change (a
    // desktop switch racing activation, a window moved away silently), and
    // without a poll the stale layout persists until the next window event.
    // check() re-derives the list and pushes only when its signature moved,
    // so this is one cheap window walk per tick and zero geometry writes
    // when nothing changed.
    Timer {
        id: pollTimer
        interval: 250
        running: root.tracker !== null
        repeat: true
        onTriggered: { if (root.tracker) root.tracker.check(); }
    }

    Component.onCompleted: {
        console.warn("RING_BUILD " + Build.BUILD_ID);
        tracker = Borders.createTracker({
            workspace: Workspace,
            readConfig: (key, fallback) => KWin.readConfig(key, fallback),
            log: msg => console.warn(msg),
            schedule: () => decorationTimer.restart(),
            ui: {
                setBorders: (list, cfg) => root.syncBorders(list, cfg),
            },
        }, Geom);
        tracker.start();
    }
    Component.onDestruction: {
        shuttingDown = true;
        hideOverlays();
        if (tracker) tracker.stop();
    }
}
