// Headless unit tests for package/contents/code/geom.js.
// Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const geom = require("../package/contents/code/geom.js");

test("overlaps: basic intersection", () => {
    assert.equal(geom.overlaps({ x: 0, y: 0, width: 10, height: 10 },
                               { x: 5, y: 5, width: 10, height: 10 }), true);
    assert.equal(geom.overlaps({ x: 0, y: 0, width: 10, height: 10 },
                               { x: 11, y: 0, width: 10, height: 10 }), false);
    assert.equal(geom.overlaps({ x: 0, y: 0, width: 10, height: 10 },
                               { x: 10, y: 0, width: 10, height: 10 }), false); // edge touch
});

test("crossesBand: menu inside window does not hide its border", () => {
    const outer = { x: 100, y: 100, width: 800, height: 600 };
    assert.equal(geom.crossesBand({ x: 200, y: 200, width: 100, height: 50 }, outer, 6), false);
    assert.equal(geom.crossesBand({ x: 90, y: 90, width: 100, height: 50 }, outer, 6), true);
    assert.equal(geom.crossesBand({ x: 0, y: 0, width: 10, height: 10 }, outer, 6), false);
});

test("grownRect: frame grown symmetrically by border width", () => {
    assert.deepEqual(geom.grownRect({ x: 10, y: 38, width: 945, height: 1032 }, 4),
                     { x: 6, y: 34, width: 953, height: 1040 });
});

test("clampRadius: never more than half the window", () => {
    assert.equal(geom.clampRadius(4, 945, 1032), 4);
    assert.equal(geom.clampRadius(500, 100, 800), 50);
    assert.equal(geom.clampRadius(-3, 100, 100), 0);
});

test("usableRect: rejects zero/NaN sizes (the stuck-framebuffer class)", () => {
    assert.equal(geom.usableRect({ x: 0, y: 0, width: 100, height: 100 }), true);
    assert.equal(geom.usableRect({ x: 0, y: 0, width: 0, height: 100 }), false);
    assert.equal(geom.usableRect({ x: NaN, y: 0, width: 100, height: 100 }), false);
});

test("tooSmallToOutline: login-time slivers are skipped", () => {
    assert.equal(geom.tooSmallToOutline({ width: 1920, height: 1080 }), false);
    assert.equal(geom.tooSmallToOutline({ width: 10, height: 10 }), true);
});

test("stripRects: four edges, and corners only with a radius", () => {
    const outer = { x: 0, y: 0, width: 100, height: 80 };
    const strips = geom.stripRects(outer, 4, 4);
    assert.equal(strips.length, 8);
    // top edge spans between the corners
    assert.deepEqual(strips[0], { x: 4, y: 0, width: 92, height: 4 });
    assert.deepEqual(strips[1], { x: 4, y: 76, width: 92, height: 4 });
    // sides are inset by max(b, r) so they do not overlap the corners
    assert.deepEqual(strips[2], { x: 0, y: 4, width: 4, height: 72 });
    assert.deepEqual(strips[3], { x: 96, y: 4, width: 4, height: 72 });
    assert.equal(geom.stripCount(outer, 4, 4), 8);
    assert.equal(geom.stripCount(outer, 4, 0), 4);
});

test("hiddenStrips: a blocker over one corner hides only that corner", () => {
    const outer = { x: 0, y: 0, width: 100, height: 80 };
    // a small window sitting on the top-left corner
    const blocker = { x: -10, y: -10, width: 30, height: 30 };
    const hidden = geom.hiddenStrips(outer, 4, 4, (strip) => geom.overlaps(blocker, strip));
    assert.ok(hidden.includes(4), "top-left corner should hide");
    assert.ok(!hidden.includes(1), "bottom edge should stay");
    assert.ok(!hidden.includes(3), "right edge should stay");
    // not everything is hidden, so the ring is still partly drawable
    assert.equal(geom.stripsHidden(outer, 4, 4, (strip) => geom.overlaps(blocker, strip)), false);
});

test("stripsHidden: a window covering the whole ring hides all of it", () => {
    const outer = { x: 0, y: 0, width: 100, height: 80 };
    const big = { x: -50, y: -50, width: 500, height: 500 };
    assert.equal(geom.stripsHidden(outer, 4, 4, (strip) => geom.overlaps(big, strip)), true);
});

test("listSig: stable, order-sensitive, focus-sensitive", () => {
    const a = [{ id: "ring-focus", x: 6, y: 34, width: 953, height: 1040, active: true }];
    const b = [{ id: "ring-focus", x: 6, y: 34, width: 953, height: 1040, active: true }];
    const moved = [{ id: "ring-focus", x: 7, y: 34, width: 953, height: 1040, active: true }];
    const blurred = [{ id: "ring-1", x: 6, y: 34, width: 953, height: 1040, active: false }];
    assert.equal(geom.listSig(a), geom.listSig(b));
    assert.notEqual(geom.listSig(a), geom.listSig(moved));
    assert.notEqual(geom.listSig(a), geom.listSig(blurred));
    assert.equal(geom.listSig([]), "[]");
});

test("shifted-symbol regression: no dead shortcut forms in this repo", async () => {
    // The Meta+! bug class (HyprKwin): a binding registered as Key_Exclam can
    // never match a real Shift+1 press (Key_1 + ShiftModifier). This script
    // has no shortcuts at all; guard against anyone adding one in the
    // shifted-symbol form.
    const { readFileSync, existsSync } = await import("node:fs");
    const files = ["package/contents/code/borders.js"];
    const bad = /Meta\+[!@#$%^&*()_<>+]/;
    for (const f of files) {
        if (!existsSync(f)) continue;
        const src = readFileSync(f, "utf8");
        for (const line of src.split("\n")) {
            if (line.trim().startsWith("//")) continue;
            assert.ok(!bad.test(line), `shifted-symbol binding in ${f}: ${line.trim()}`);
        }
    }
});
