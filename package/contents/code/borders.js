/*
 * Active Ring tracker: tiler-agnostic Hyprland-style focus rings.
 *
 * Watches every normal window (any tiler, or none) and reports one grown
 * rect per outlined window to the QML host, which draws the overlay strips.
 * Border drawing itself lives in ui/Border.qml + ui/BorderStrip.qml.
 *
 * Decision logic adapted from HyprKwin's updateDecorations()
 * (GPL-3.0-or-later, by dgbooth), trimmed to borders only: no layout
 * engine, no groups, no tab bars, no icon tiles, no opacity rules.
 */

var OVERLAY_TITLE = "HyprKwin overlay"; // shared with the animations effect

function num(v, d) {
    var n = Number(v);
    return isFinite(n) ? n : d;
}

function bool(v, d) {
    if (v === undefined || v === null || v === "") return d;
    return v === true || v === "true" || v === 1 || v === "1";
}

function colour(v, d) {
    return (typeof v === "string" && v !== "") ? v : d;
}

function createTracker(env, geom) {
    var ws = env.workspace;
    var cfg = {};
    var stopped = false;
    var connected = [];

    function log() {
        if (!cfg.debug) return;
        env.log("Ring: " + Array.prototype.join.call(arguments, " "));
    }

    function vlog() {
        if (!cfg.debug || !cfg.debugVerbose) return;
        env.log("Ring verbose: " + Array.prototype.join.call(arguments, " "));
    }

    function loadConfig() {
        var rc = env.readConfig;
        cfg = {
            debug: bool(rc("Debug", false), false),
            debugVerbose: bool(rc("DebugVerbose", false), false),
            borderSize: Math.max(0, num(rc("BorderSize", 4), 4)),
            borderRadius: Math.max(0, num(rc("BorderRadius", 4), 4)),
            activeBorderSource: num(rc("ActiveBorderSource", 0), 0),
            activeBorderColor: colour(rc("ActiveBorderColor", "#33ccff"), "#33ccff"),
            activeBorderColor2: colour(rc("ActiveBorderColor2", "#00ff99"), "#00ff99"),
            borderGradientAngle: num(rc("BorderGradientAngle", 45), 45),
            borderGradientSpin: Math.max(0, num(rc("BorderGradientSpin", 0), 0)),
            inactiveBorderSource: num(rc("InactiveBorderSource", 0), 0),
            inactiveBorderColor: colour(rc("InactiveBorderColor", "#595959"), "#595959"),
            showInactiveBorders: bool(rc("ShowInactiveBorders", false), false),
            borderOnUndecorated: bool(rc("BorderOnUndecorated", true), true),
            drawOnDecorated: bool(rc("DrawOnDecorated", false), false),
        };
        log("config borderSize=" + cfg.borderSize + " borderRadius=" + cfg.borderRadius +
            " showInactive=" + cfg.showInactiveBorders +
            " onUndecorated=" + cfg.borderOnUndecorated +
            " onDecorated=" + cfg.drawOnDecorated);
    }

    function copyRect(r) {
        return { x: r.x, y: r.y, width: r.width, height: r.height };
    }

    // frame > client means a server-side decoration is present; CSD and
    // borderless windows report equal sizes, so they read as undecorated.
    function isDecorated(w) {
        var f = w.frameGeometry, c = w.clientGeometry;
        if (!f || !c) return false;
        return Math.round(f.width) > Math.round(c.width) ||
            Math.round(f.height) > Math.round(c.height);
    }

    function isOverlay(w) {
        var pid = -1;
        try { pid = w.pid; } catch (e) { pid = -1; }
        var cap = "";
        try { cap = String(w.caption); } catch (e) { cap = ""; }
        return pid <= 0 && cap === OVERLAY_TITLE;
    }

    function onCurrentActivity(w) {
        var acts = w.activities;
        return !acts || acts.length === 0 || acts.indexOf(ws.currentActivity) >= 0;
    }

    function onVisibleDesktop(w) {
        if (w.onAllDesktops) return true;
        var cur = ws.currentDesktop;
        if (!cur) return true;
        var ds = w.desktops || [];
        for (var i = 0; i < ds.length; i++) if (ds[i] === cur) return true;
        return false;
    }

    function kwinVisible(w) {
        if (w.minimized || w.deleted) return false;
        if (!w.visible) return false;
        return true;
    }

    // Menus, combo boxes and tooltips are ordinary windows to KWin, and our
    // overlays are drawn above them, so a menu spilling past a window's edge
    // would have the border painted over it.
    function allWindows() {
        try {
            if (ws.windowList) return ws.windowList() || [];
        } catch (e) { /* fall through */ }
        try {
            if (ws.windows) return ws.windows || [];
        } catch (e) { /* fall through */ }
        return [];
    }

    function popupRects() {
        var out = [];
        var all = allWindows();
        for (var i = 0; i < all.length; i++) {
            var w = all[i];
            if (!w || w.minimized || w.deleted) continue;
            if (!(w.popupWindow || w.popupMenu || w.dropdownMenu || w.menu || w.comboBox || w.tooltip)) continue;
            if (isOverlay(w)) continue;
            out.push(copyRect(w.frameGeometry));
        }
        return out;
    }

    // Whether a window stacked above `w` crosses the ring its border occupies.
    function coveredAbove(w, outer, thickness) {
        var order = ws.stackingOrder || [];
        var i = 0;
        while (i < order.length && order[i] !== w) i++;
        for (var j = i + 1; j < order.length; j++) {
            var o = order[j];
            if (!o || o.deleted || o.minimized || isOverlay(o)) continue;
            if (o.desktopWindow || o.dock || o.popupWindow) continue;
            if (!(o.normalWindow || o.dialog || o.utility || o.notification || o.criticalNotification)) continue;
            if (!kwinVisible(o) || !onCurrentActivity(o)) continue;
            if (geom.crossesBand(copyRect(o.frameGeometry), outer, thickness)) return true;
        }
        return false;
    }

    function ruleNoBorder(w) {
        void w;
        return false; // v1 has no window rules; reserved for later.
    }

    function update() {
        if (stopped) return;
        vlog("update");
        var list = [];
        if (cfg.borderSize <= 0) {
            env.ui.setBorders(list, cfg);
            return;
        }
        var active = ws.activeWindow;
        var popups = popupRects();
        var fullscreenScreens = {};
        var all = allWindows();
        var i, w;
        for (i = 0; i < all.length; i++) {
            w = all[i];
            if (w && w.fullScreen && w.output) fullscreenScreens[w.output.name] = true;
        }
        for (i = 0; i < all.length; i++) {
            w = all[i];
            if (!w || w.deleted || w.minimized) continue;
            if (isOverlay(w)) continue;
            var cls = "";
            try { cls = w.resourceClass; } catch (e) { cls = ""; }
            if (cls === "plasmashell") continue;
            if (w.desktopWindow || w.dock || w.splash) continue;
            if (w.fullScreen || (w.maximizeMode !== undefined && w.maximizeMode !== 0)) {
                vlog("skip fullscreen/maximized", w.caption);
                continue;
            }
            if (ruleNoBorder(w)) continue;
            // Launchers and tool palettes draw their own look, often inside
            // a larger transparent window, so a border would outline the
            // invisible part.
            if (w.utility || w.skipTaskbar || !(w.normalWindow || w.dialog)) {
                vlog("skip non-normal", w.caption);
                continue;
            }
            if (!onCurrentActivity(w) || !onVisibleDesktop(w)) continue;
            // A decoration already outlines this window: only fill in where
            // it cannot reach (CSD / borderless), unless forced on.
            var decorated = isDecorated(w);
            if (!cfg.drawOnDecorated && decorated) {
                vlog("skip decorated", w.caption);
                continue;
            }
            if (!cfg.borderOnUndecorated && !decorated) {
                vlog("skip undecorated (BorderOnUndecorated off)", w.caption);
                continue;
            }
            if (fullscreenScreens[w.output ? w.output.name : ""]) continue;
            var isActive = w === active;
            if (!isActive && !cfg.showInactiveBorders) continue;
            var r = w.frameGeometry, b = cfg.borderSize;
            var id = "ring-focus";
            if (!isActive) {
                try { id = "ring-" + String(w.internalId); }
                catch (e) { id = "ring-" + i; }
            }
            var outer = { id: id, x: r.x - b, y: r.y - b,
                          width: r.width + 2 * b, height: r.height + 2 * b,
                          active: isActive };
            if (!geom.usableRect(outer) || geom.tooSmallToOutline(r)) {
                log("skipping border for", w.caption, JSON.stringify(outer));
                continue;
            }
            var band = b + Math.max(0, cfg.borderRadius);
            var hidden = false;
            for (var p = 0; p < popups.length; p++) {
                if (geom.crossesBand(popups[p], outer, band)) {
                    log("border hidden behind a popup", w.caption);
                    hidden = true;
                    break;
                }
            }
            if (hidden) continue;
            // Overlays are drawn above everything, so a window stacked
            // over this one must not have the border painted across it.
            if (coveredAbove(w, outer, band)) {
                log("border hidden behind a window above", w.caption);
                continue;
            }
            list.push(outer);
        }
        env.ui.setBorders(list, cfg);
    }

    function schedule() {
        if (stopped) return;
        env.schedule();
    }

    function connectWindow(w) {
        try {
            var onGeom = function () { schedule(); };
            w.frameGeometryChanged.connect(onGeom);
            connected.push({ signal: w.frameGeometryChanged, fn: onGeom });
        } catch (e) { /* signal missing on this KWin version */ }
    }

    function onWindowAdded(w) {
        if (!w || isOverlay(w)) return;
        connectWindow(w);
        log("track", w.caption);
        schedule();
    }

    function onWindowRemoved(w) {
        try { log("untrack", w.caption); } catch (e) {}
        schedule();
    }

    function start() {
        loadConfig();
        var listen = function (signal, fn) {
            try { signal.connect(fn); connected.push({ signal: signal, fn: fn }); }
            catch (e) { /* not available */ }
        };
        listen(ws.windowAdded, onWindowAdded);
        listen(ws.windowRemoved, onWindowRemoved);
        listen(ws.windowActivated, function () { schedule(); });
        if (ws.stackingOrderChanged) listen(ws.stackingOrderChanged, function () { schedule(); });
        listen(ws.currentDesktopChanged, function () { schedule(); });
        listen(ws.currentActivityChanged, function () { schedule(); });
        if (ws.screensChanged) listen(ws.screensChanged, function () { schedule(); });
        var existing = allWindows();
        for (var i = 0; i < existing.length; i++) {
            if (existing[i] && !isOverlay(existing[i])) connectWindow(existing[i]);
        }
        log("started");
        schedule();
    }

    function stop() {
        stopped = true;
        for (var i = 0; i < connected.length; i++) {
            try { connected[i].signal.disconnect(connected[i].fn); } catch (e) {}
        }
        connected = [];
        env.ui.setBorders([], cfg);
    }

    return { start: start, stop: stop, update: update, loadConfig: loadConfig };
}
