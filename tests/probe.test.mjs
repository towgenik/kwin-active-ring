// Structural checks on the probe script: it must stay read-only (no writes
// to window properties or geometry) and must keep the SNAP markers that
// tools/probe.sh greps for.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../tools/probe.js", import.meta.url), "utf8");

test("probe emits the markers probe.sh greps for", () => {
    assert.match(src, /SNAP/);
    assert.match(src, /SNAP end/);
});

test("probe never mutates window state", () => {
    // Disallow any assignment to a property on a window-like object.
    const writes = src.match(/\b\w+\.(frameGeometry|desktops|onAllDesktops|noBorder|keepAbove|keepBelow|skipTaskbar|skipSwitcher|minimized)\s*=/g) || [];
    assert.deepEqual(writes, [], "probe must not write window properties");
});

test("probe does not call mutating workspace APIs", () => {
    for (const fn of ["raiseWindow", "lowerWindow", "setCurrentDesktop", "reconfigure"]) {
        assert.ok(!new RegExp("\\b" + fn + "\\s*\\(").test(src), "probe must not call " + fn);
    }
});

test("probe reports desk, stacking order and work area", () => {
    for (const needle of ["stackingOrder", "desktops", "clientArea", "onAllDesktops", "frameGeometry"]) {
        assert.ok(src.includes(needle), "probe should report " + needle);
    }
});
