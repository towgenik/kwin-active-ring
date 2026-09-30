import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../tools/probe.js", import.meta.url), "utf8");

test("excludes windows that overlap others by design", () => {
    // The desktop background, the panel and the ring's own overlay strips all
    // span other windows. Counting them produced a false alarm on every run.
    for (const needle of ['capa === "HyprKwin overlay"', "wa.dock", "wa.desktopWindow", "plasmashell"]) {
        assert.ok(src.includes(needle), "probe should skip " + needle);
    }
});

test("ignores a small floating dialog over a tiled window", () => {
    // zenity/kdialog over a tile is normal. Only two *large* windows sharing
    // space is the wedged-tiler signature worth shouting about.
    assert.match(src, /gg\.width < area\.width \* 0\.25 && gg\.height < area\.height \* 0\.25/);
});

test("tolerates the 1-2px overlap that borders produce", () => {
    assert.match(src, /ox > 4 && oy > 4/);
});

test("reports which windows clash and by how much", () => {
    assert.match(src, /OVERLAP/);
    assert.match(src, /Math\.round\(ox\) \+ "x" \+ Math\.round\(oy\)/);
});

test("stays quiet when nothing overlaps", () => {
    assert.match(src, /ok: no overlap/);
});

test("no variable shadowing between the work area and the loop counters", () => {
    // `var a = ws.clientArea(...)` collided with `for (var a = 0; ...)` and
    // silently turned the size filter into a comparison against a number.
    assert.match(src, /var area = ws\.clientArea\(/);
    assert.ok(
        !/for \(var a = /.test(src),
        "loop counters must not reuse the work-area name"
    );
});

test("windows on different desktops are not reported as overlapping", () => {
    // brave on D2 and a terminal on D1 have rectangles that intersect in
    // coordinates, but they are never on screen together. Comparing raw
    // rectangles produced a false alarm on every multi-desktop setup.
    assert.match(src, /function shareDesktop/);
    assert.match(src, /if \(!shareDesktop\(solid\[x\]\.d, solid\[y\]\.d\)\) continue;/);
});

test("a window on all desktops shares the screen with everything", () => {
    // deskList returns null for onAllDesktops and shareDesktop treats null as
    // "always shares" -- otherwise an all-desktops window would be silently
    // excluded from every comparison.
    assert.match(src, /if \(c\.onAllDesktops\) return null;/);
    assert.match(src, /if \(a === null \|\| b === null\) return true;/);
});
