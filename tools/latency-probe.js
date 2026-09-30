// Measure the latency of the panel-toggle re-tile, end to end.
//
//   t0  = the dock window being added/removed (the event the patch listens to)
//   t1  = the first client geometry change that follows
//
// Reported as t1 - t0 in ms. Entirely event-driven: two signal connections,
// no polling and no timer, so it adds nothing to the thing being measured.
//
// Usage:
//   qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript \
//       tools/latency-probe.js lat-$(date +%s) >/dev/null
//   qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.start >/dev/null
//   ...press Meta+Shift+Space a few times...
//   journalctl --user -u plasma-kwin_wayland -f | grep 'LAT '
//   qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript lat-...
//
// Read-only: it only connects to signals and prints.

var t0 = null;
var tKey = null;
var armed = false;

function areaStr() {
    var a = workspace.clientArea(0, workspace.activeScreen, workspace.currentDesktop);
    return a.y + "," + a.width + "x" + a.height;
}

function isDock(c) {
    if (!c) return false;
    try { if (c.dock) return true; } catch (e) {}
    try { if (c.resourceClass === "plasmashell" && !c.desktopWindow) return true; } catch (e) {}
    return false;
}

// Report the first geometry movement after a dock event, then disarm so one
// toggle produces exactly one line.
function onGeom() {
    if (!armed) return;
    armed = false;
    var dt = Date.now() - t0;
    console.warn("LAT tiles moved " + dt + "ms after dock event (workArea " + areaStr() + ")");
}

function watch(c) {
    if (!c) return;
    var cap = "";
    try { cap = String(c.caption); } catch (e) {}
    if (cap === "HyprKwin overlay") return;
    try { c.frameGeometryChanged.connect(onGeom); } catch (e) {}
    try { c.bufferGeometryChanged.connect(onGeom); } catch (e) {}
}

function onDock(tag, c) {
    if (!isDock(c)) return;
    t0 = Date.now();
    armed = true;
    console.warn("LAT dock " + tag + " at t0, workArea " + areaStr());
    var l = workspace.windowList();
    for (var i = 0; i < l.length; i++) watch(l[i]);
}

function init() {
    var l = workspace.windowList();
    for (var i = 0; i < l.length; i++) watch(l[i]);
    workspace.windowAdded.connect(function (c) { watch(c); onDock("added", c); });
    workspace.windowRemoved.connect(function (c) { onDock("removed", c); });
    console.warn("LAT ready; workArea " + areaStr());
}
init();
