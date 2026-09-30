import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../tools/resize-keys.py", import.meta.url), "utf8");

test("all four resize directions are bound", () => {
    for (const action of [
        "KrohnkiteShrinkWidth",
        "KrohnkitegrowWidth",
        "KrohnkiteShrinkHeight",
        "KrohnkiteGrowHeight",
    ]) {
        assert.ok(src.includes(`"${action}"`), `expected ${action}`);
    }
});

test("resize uses Alt+arrow, not the arrows already taken", () => {
    // Meta+<arrow> is focus and Meta+Shift+<arrow> is window-move in the
    // tiler; resize must not collide with either.
    assert.match(src, /"Meta\+Alt\+Left"/);
    assert.match(src, /"Meta\+Alt\+Right"/);
    assert.match(src, /"Meta\+Alt\+Up"/);
    assert.match(src, /"Meta\+Alt\+Down"/);
    for (const clash of ["Meta+Left", "Meta+Shift+Left", "Meta+Ctrl+Left"]) {
        assert.ok(
            !new RegExp(`"${clash.replace("+", "\\+")}"`).test(src),
            `${clash} is already taken by focus/move/desktop`
        );
    }
});

test("the shifted height pair stays unbound", () => {
    // Meta+Shift+- and Meta+Shift+= encode to Key_Underscore/Key_Plus with no
    // Shift bit -- the dead form behind HyprKwin's Meta+! bug. Do not
    // reintroduce them.
    assert.ok(!/"Meta\+Shift\+[-+]"/.test(src), "shifted resize pair must stay unbound");
});

test("an action's own binding is not treated as a conflict", () => {
    assert.match(src, /mine/);
    assert.match(src, /!= mine/);
});

test("comparison is order-insensitive so reruns are no-ops", () => {
    assert.match(src, /set\(infos\[action\]\["keys"\]\) == set\(codes\)/);
});
