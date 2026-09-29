// Minimal tiler-agnostic border tracker. Supplies HyprKwin-style overlay
// rings (ui/Border.qml) for ordinary windows, SSD or CSD alike.
//
// Only the border appearance is ported: size, radius, theme/custom/gradient
// sources, active/inactive colors, gradient angle/spin, inactive toggle.
// Deliberately left behind: layout engine, groups, tab bars, icon tiles,
// opacity rules, divider slides.
"use strict";

var OVERLAY_TITLE = "HyprKwin overlay"; // kept so hyprkwinanimations picks rings up
var MIN_SIZE = 32;

function createDriver(env) {
    var ws = env.workspace;
    var cfg = loadConfig();
    var connected = [];

    function log() {
        if (cfg.debug) env.log("ActiveRing: " + Array.prototype.join.call(arguments, " "));
    }

    function num(v, d) {
        v = parseFloat(v);
        return isNaN(v) ? d : v;
    }
    function bool(v, d) {
        if (v === undefined || v === null || v === "") return d;
        return v === true || v === "true" || v === 1 || v === "1";
    }
    function colour(v, d) {
        return typeof v === "string" && v ? v : d;
    }

    function loadConfig() {
        var rc = env.readConfig;
        return {
            borderSize: Math.max(0, num(rc("BorderSize", 4), 4)),
            borderRadius: Math.max(0, num(rc("BorderRadius", 4), 4)),
            activeSource: num(rc("ActiveBorderSource", 0), 0),
            inactiveSource: num(rc("InactiveBorderSource", 0), 0),
            activeColor: colour(rc("ActiveBorderColor", "#33ccff"), "#33ccff"),
            activeColor2: colour(rc("ActiveBorderColor2", "#00ff99"), "#00ff99"),
            inactiveColor: colour(rc("InactiveBorderColor", "#595959"), "#595959"),
            gradientAngle: num(rc("BorderGradientAngle", 45), 45),
            gradientSpin: Math.max(0, num(rc("BorderGradientSpin", 0), 0)),
            showInactive: bool(rc("ShowInactiveBorders", false), false),
            borderOnUndecorated: bool(rc("BorderOnUndecorated", true), true),
            debug: bool(rc("Debug", false), false),
        };
    }

    function idOf(w) {
        try { return "w" + w.internalId; } catch (e) { return null; }
    }

    function isOverlay(w) {
        try { return w.caption === OVERLAY_TITLE; } catch (e) { return false; }
    }

    function usable(r) {
        return r && r.width >= MIN_SIZE && r.height >= MIN_SIZE;
    }

    // Mirrors HyprKwin's shouldAnimate guards minus animation state: only
    // ordinary windows get rings. Fullscreen/maximized are left to KWin.
    function shouldBorder(w) {
        if (!w || w.deleted || w.minimized || !w.visible) return false;
        if (isOverlay(w)) return false;
        try {
            if (w.fullScreen) return false;
            if (w.maximizeMode !== undefined && w.maximizeMode !== 0) return false;
            if (w.desktopWindow || w.dock || w.popupWindow || w.splash) return false;
            if (!(w.normalWindow || w.dialog)) return false;
        } catch (e) { return false; }
        return true;
    }

    // Windows stacked above `w` whose frame touches its ring band: the ring
    // would paint over them, so skip it (trimmed port of HyprKwin's
    // popupRects/crossesBand/coveredAbove).
    function coveredAbove(w, g, b) {
        var order;
        try { order = ws.stackingOrder; } catch (e) { return false; }
        if (!order || !order.length) return false;
        var band = {
            x: g.x - b, y: g.y - b,
            width: g.width + 2 * b, height: g.height + 2 * b,
        };
        var above = false;
        for (var i = 0; i < order.length; i++) {
            var o = order[i];
            if (o === w) { above = true; continue; }
            if (!above) continue;
            if (o.deleted || o.minimized || !o.visible) continue;
            if (isOverlay(o)) continue;
            try {
                if (o.popupWindow) {
                    var p = o.frameGeometry;
                    if (p.x < band.x + band.width && band.x < p.x + p.width &&
                        p.y < band.y + band.height && band.y < p.y + p.height) return true;
                } else if (o.normalWindow || o.dialog) {
                    var f = o.frameGeometry;
                    if (f.x <= band.x && f.y <= band.y &&
                        f.x + f.width >= band.x + band.width &&
                        f.y + f.height >= band.y + band.height) return true;
                }
            } catch (e) {}
        }
        return false;
    }

    function updateBorders() {
        cfg = loadConfig();
        if (cfg.borderSize <= 0) {
            env.ui.setBorders([], cfg);
            return;
        }
        var out = [];
        var list;
        try { list = ws.windowList(); } catch (e) { return; }
        var active = null;
        try { active = ws.activeWindow; } catch (e) {}
        for (var i = 0; i < list.length; i++) {
            var w = list[i];
            if (!shouldBorder(w)) continue;
            var isActive = (w === active);
            if (!isActive && !cfg.showInactive) continue;
            var g;
            try { g = w.frameGeometry; } catch (e) { continue; }
            if (!usable(g)) continue;
            var b = cfg.borderSize;
            if (coveredAbove(w, g, b)) continue;
            var id = idOf(w);
            if (!id) continue;
            out.push({
                id: id,
                x: g.x - b, y: g.y - b,
                width: g.width + 2 * b, height: g.height + 2 * b,
                active: isActive,
            });
        }
        log("update:", out.length, "rings");
        env.ui.setBorders(out, cfg);
    }

    function track(w) {
        try {
            if (w.frameGeometryChanged)
                w.frameGeometryChanged.connect(function () { env.scheduleBorders(); });
            if (w.visibleChanged)
                w.visibleChanged.connect(function () { env.scheduleBorders(); });
            if (w.minimizedChanged)
                w.minimizedChanged.connect(function () { env.scheduleBorders(); });
        } catch (e) {}
    }

    function start() {
        try {
            if (ws.windowAdded) ws.windowAdded.connect(function (w) { track(w); env.scheduleBorders(); });
            if (ws.windowRemoved) ws.windowRemoved.connect(function () { env.scheduleBorders(); });
            if (ws.windowActivated) ws.windowActivated.connect(function () { env.scheduleBorders(); });
            if (ws.stackingOrderChanged) ws.stackingOrderChanged.connect(function () { env.scheduleBorders(); });
        } catch (e) {}
        var list;
        try { list = ws.windowList(); } catch (e) { list = []; }
        for (var i = 0; i < list.length; i++) track(list[i]);
        log("started");
        env.scheduleBorders();
    }

    function stop() {
        try { env.ui.setBorders([], cfg); } catch (e) {}
    }

    return {
        start: start,
        stop: stop,
        updateBorders: updateBorders,
        config: function () { return cfg; },
    };
}
