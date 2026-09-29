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
