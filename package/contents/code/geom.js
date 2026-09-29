// Pure border-geometry helpers. No KWin globals here on purpose: the CI
// unit tests import this file in node, while Ring.qml imports it as a QML
// scripting library and hands it to the tracker through the env seam.
// Geometry adapted from HyprKwin's driver.js (GPL-3.0-or-later, by dgbooth).

// Windows briefly report tiny geometry while they are mapped or restored
// at login; a border drawn then would be a stray sliver on screen.
var MIN_DECORATED_SIZE = 32;

function overlaps(a, b) {
    return a.x < b.x + b.width && b.x < a.x + a.width &&
        a.y < b.y + b.height && b.y < a.y + a.height;
}

// True when the rect crosses the band an overlay occupies: the ring
// between `outer` and `outer` shrunk by `thickness`. A menu that stays
// inside the window never hides its border.
function crossesBand(rect, outer, thickness) {
    if (!overlaps(rect, outer)) return false;
    var inner = {
        x: outer.x + thickness, y: outer.y + thickness,
        width: Math.max(0, outer.width - 2 * thickness),
        height: Math.max(0, outer.height - 2 * thickness),
    };
    var insideInner = rect.x >= inner.x && rect.y >= inner.y &&
        rect.x + rect.width <= inner.x + inner.width &&
        rect.y + rect.height <= inner.y + inner.height;
    return !insideInner;
}

// Outer rect for a window's ring: its frame grown by the border width.
function grownRect(frame, b) {
    return { x: frame.x - b, y: frame.y - b,
             width: frame.width + 2 * b, height: frame.height + 2 * b };
}

// Corners can never take more than half the window (mirrors Border.qml).
function clampRadius(radius, width, height) {
    return Math.max(0, Math.min(radius, Math.floor(Math.min(width, height) / 2)));
}

// Stable signature for a border list: ids, rects and focus state.
// check() compares these instead of pushing geometry at KWin every tick.
function listSig(list) {
    return JSON.stringify((list || []).map(function (e) {
        return [e.id, e.x, e.y, e.width, e.height, e.active ? 1 : 0].join(",");
    }));
}

// A rect KWin can actually render an overlay for.
function usableRect(r) {
    return !!r && isFinite(r.x) && isFinite(r.y) &&
        isFinite(r.width) && isFinite(r.height) && r.width >= 1 && r.height >= 1;
}

// Guard for windows too small to outline (mirrors update()).
function tooSmallToOutline(frame) {
    return !frame || frame.width < MIN_DECORATED_SIZE || frame.height < MIN_DECORATED_SIZE;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        MIN_DECORATED_SIZE: MIN_DECORATED_SIZE,
        overlaps: overlaps,
        crossesBand: crossesBand,
        grownRect: grownRect,
        clampRadius: clampRadius,
        listSig: listSig,
        usableRect: usableRect,
        tooSmallToOutline: tooSmallToOutline,
    };
}
