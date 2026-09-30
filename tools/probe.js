// Read-only snapshot of the whole window/desktop picture, for diagnosing
// tiling, borders and hotkeys. Safe to load and unload repeatedly; it only
// prints, it never moves or changes anything.
//
// Usage (from a shell):
//   qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript \
//       tools/probe.js probe-$(date +%s) >/dev/null
//   qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.start >/dev/null
//   journalctl --user -u plasma-kwin_wayland -n 5 --no-pager | grep SNAP
//   qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript probe-...

function init() {
    var ws = workspace;

    // Desktop index -> id, so output is stable across runs even if KWin
    // reorders the list.
    var names = {};
    var ds = ws.desktops || [];
    for (var i = 0; i < ds.length; i++) names[ds[i].id] = "D" + (i + 1);
    function deskOf(c) {
        var out = [];
        try {
            if (c.onAllDesktops) return "ALL";
            for (var j = 0; j < c.desktops.length; j++) out.push(names[c.desktops[j].id] || "?");
        } catch (e) { return "?"; }
        return out.length ? out.join("+") : "ALL";
    }

    var a = ws.clientArea(0, ws.activeScreen, ws.currentDesktop);
    var full = ws.clientArea(3, ws.activeScreen, ws.currentDesktop);
    var currentName = names[ws.currentDesktop.id] || ws.currentDesktop.id;
    var act = ws.activeWindow;
    var actCls = "none";
    if (act) { try { actCls = act.resourceClass; } catch (e) {} }

    console.warn("SNAP cur=" + currentName + " active=" + actCls
        + " workArea=" + a.x + "," + a.y + " " + a.width + "x" + a.height
        + " fullArea=" + full.x + "," + full.y + " " + full.width + "x" + full.height
        + " screens=" + (ws.screens || []).length);

    // Stacking order, top of the list last: it is what decides who covers
    // whom, which is the whole question for border culling.
    var order = ws.stackingOrder || [];
    var lines = [];
    for (var k = 0; k < order.length; k++) {
        var c = order[k], cls = "?", cap = "?", g = c.frameGeometry;
        try { cls = c.resourceClass; } catch (e) {}
        try { cap = String(c.caption); } catch (e) {}
        var overlay = (cap === "HyprKwin overlay");
        var tag = overlay ? "overlay" : (cls || "?" );
        var kind = [];
        if (overlay) kind.push("overlay");
        if (cls === "plasmashell") kind.push(c.dock ? "dock" : "desktop-shell");
        if (c.desktopWindow) kind.push("desktopWindow");
        if (c.popupWindow) kind.push("popup");
        if (c.utility) kind.push("utility");
        if (c.minimized) kind.push("minimized");
        lines.push("  " + k + " " + tag + (kind.length ? " [" + kind.join(",") + "]" : "")
            + " @" + g.x + "," + g.y + " " + g.width + "x" + g.height
            + " desk=" + deskOf(c)
            + (cls === "plasmashell" || overlay ? "" : " min=" + (c.minSize ? c.minSize.width + "x" + c.minSize.height : "?")));
    }
    lines.forEach(function (l) { console.warn("SNAP" + l); });
    console.warn("SNAP end");
}
init();
