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

    // The same thing as a list, for set operations. "ALL" means the window is
    // on every desktop, so it shares the screen with everything.
    function deskList(c) {
        try {
            if (c.onAllDesktops) return null;
            var out = [];
            for (var j = 0; j < c.desktops.length; j++) out.push(c.desktops[j].id);
            return out;
        } catch (e) { return null; }
    }

    function shareDesktop(a, b) {
        if (a === null || b === null) return true;   // on all desktops
        for (var i = 0; i < a.length; i++) {
            for (var j = 0; j < b.length; j++) if (a[i] === b[j]) return true;
        }
        return false;
    }

    var area = ws.clientArea(0, ws.activeScreen, ws.currentDesktop);
    var full = ws.clientArea(3, ws.activeScreen, ws.currentDesktop);
    var currentName = names[ws.currentDesktop.id] || ws.currentDesktop.id;
    var act = ws.activeWindow;
    var actCls = "none";
    if (act) { try { actCls = act.resourceClass; } catch (e) {} }

    console.warn("SNAP cur=" + currentName + " active=" + actCls
        + " workArea=" + area.x + "," + area.y + " " + area.width + "x" + area.height
        + " fullArea=" + full.x + "," + full.y + " " + full.width + "x" + full.height
        + " screens=" + (ws.screens || []).length);

    // Stacking order, top of the list last: it is what decides who covers
    // whom, which is the whole question for border culling.
    var order = ws.stackingOrder || [];
    var lines = [];
    function stackName(c) {
        var cls = "", cap = "";
        try { cls = c.resourceClass; } catch (e) {}
        try { cap = String(c.caption); } catch (e) {}
        if (cap === "HyprKwin overlay") return "overlay";
        return cls || "?";
    }
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

    // Overlap check. A tiler that has been driven into a bad state leaves
    // windows stacked on top of each other with no error anywhere, and the
    // only reliable cure is a restart. Catch it here instead.
    var solid = [];
    for (var si = 0; si < order.length; si++) {
        var wa = order[si], capa = "";
        try { capa = String(wa.caption); } catch (e) {}
        // Only real application windows. The desktop background, the panel and
        // the overlay strips all span other windows by design.
        if (capa === "HyprKwin overlay") continue;
        if (wa.dock || wa.desktopWindow || wa.popupWindow || wa.utility) continue;
        try { if (wa.resourceClass === "plasmashell") continue; } catch (e) {}
        if (wa.minimized) continue;
        var gg = wa.frameGeometry;
        // A small window on top of a tiled one is a normal floating dialog.
        // The failure we care about is two *large* windows overlapping, which
        // is what a wedged tiler leaves behind. The probe cannot read the
        // tiler's float state, so size is the proxy.
        if (gg.width < area.width * 0.25 && gg.height < area.height * 0.25) continue;
        solid.push({ n: stackName(wa), g: gg, d: deskList(wa) });
    }
    var clashes = [];
    for (var x = 0; x < solid.length; x++) {
        for (var y = x + 1; y < solid.length; y++) {
            // Windows on disjoint desktops never share the screen, so their
            // rectangles are allowed to overlap.
            if (!shareDesktop(solid[x].d, solid[y].d)) continue;
            var ga = solid[x].g, gb = solid[y].g;
            var ox = Math.min(ga.x + ga.width, gb.x + gb.width) - Math.max(ga.x, gb.x);
            var oy = Math.min(ga.y + ga.height, gb.y + gb.height) - Math.max(ga.y, gb.y);
            // Ignore a sliver: borders and rounding produce 1-2px of overlap
            // between neighbours that are actually fine.
            if (ox > 4 && oy > 4) {
                clashes.push(solid[x].n + " x " + solid[y].n
                    + " (" + Math.round(ox) + "x" + Math.round(oy) + "px)");
            }
        }
    }
    if (clashes.length) {
        console.warn("SNAP !! OVERLAP: " + clashes.join("  "));
        console.warn("SNAP !! two large windows are on top of each other -- the tiler");
        console.warn("SNAP !! is wedged. Meta+Shift+F twice, or restart the session.");
    } else {
        console.warn("SNAP ok: no overlap");
    }
    console.warn("SNAP end");
}
init();
