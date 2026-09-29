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
        return [e.id, e.x, e.y, e.width, e.height, e.active ? 1 : 0,
            (e.hiddenStrips || []).join("-")].join(",");
    }));
}

// The eight strip areas of a ring, in Border.qml's order:
// 0 top, 1 bottom, 2 left, 3 right, 4..7 corners (corners need r > 0).
// Shared so the tracker and the drawing agree on where each strip is.
function stripRects(outer, b, r) {
    var o = outer;
    var inset = Math.max(b, r);
    return [
        { x: o.x + r, y: o.y, width: o.width - 2 * r, height: b },
        { x: o.x + r, y: o.y + o.height - b, width: o.width - 2 * r, height: b },
        { x: o.x, y: o.y + inset, width: b, height: o.height - 2 * inset },
        { x: o.x + o.width - b, y: o.y + inset, width: b, height: o.height - 2 * inset },
        { x: o.x, y: o.y, width: r, height: r },
        { x: o.x + o.width - r, y: o.y, width: r, height: r },
        { x: o.x, y: o.y + o.height - r, width: r, height: r },
        { x: o.x + o.width - r, y: o.y + o.height - r, width: r, height: r },
    ];
}

// Which strips isHidden() rejects, as an array of indices.
function hiddenStrips(outer, b, r, isHidden) {
    var rects = stripRects(outer, b, r);
    var out = [];
    for (var i = 0; i < rects.length; i++) {
        if (i >= 4 && r <= 0) continue;   // corners are not drawn
        if (isHidden(rects[i], i)) out.push(i);
    }
    return out;
}

// True when nothing of the ring is left to draw.
function stripsHidden(outer, b, r, isHidden) {
    var hidden = hiddenStrips(outer, b, r, isHidden);
    return hidden.length === stripCount(outer, b, r);
}

// How many strips this ring actually has.
function stripCount(outer, b, r) {
    return r > 0 ? 8 : 4;
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
        stripRects: stripRects,
        hiddenStrips: hiddenStrips,
        stripsHidden: stripsHidden,
        stripCount: stripCount,
        usableRect: usableRect,
        tooSmallToOutline: tooSmallToOutline,
    };
}
