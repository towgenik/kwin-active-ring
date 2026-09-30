import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../tools/desktop-keys.py", import.meta.url), "utf8");

test("covers the whole one-desktop-at-a-time action family", () => {
    // Switching and window-moving must be bound in pairs, or you end up able
    // to leave a window behind on the old desktop.
    for (const prefix of ["Switch One Desktop", "Window One Desktop"]) {
        for (const dir of ["Left", "Right", "Up", "Down"]) {
            // KWin spells the horizontal ones "to the Left"/"to the Right" and
            // the vertical ones just "Up"/"Down" -- match either spelling.
            assert.match(
                src,
                new RegExp(`"${prefix} (to the )?${dir}"`),
                `expected a binding for ${prefix} ${dir}`
            );
        }
    }
});

test("no digit appears in any bound combo", () => {
    // The whole point of this file: Shift+digit cannot be verified on this
    // machine, so the primary mapping must not depend on it.
    const combos = [...src.matchAll(/"(Meta[^"]*)"/g)].map((m) => m[1]);
    assert.ok(combos.length > 0, "expected some bindings");
    for (const c of combos) {
        assert.ok(!/[0-9]/.test(c), `${c} contains a digit`);
    }
});

test("digit parity is reported but never bound", () => {
    // Omarchy's digit mapping stays in the config for compatibility, but the
    // tool must only read it, never write it.
    assert.match(src, /Window to Desktop %d/);
    const parityBlock = src.slice(src.indexOf("Omarchy digit parity"));
    assert.ok(
        !parityBlock.includes("set_keys"),
        "digit parity block must not call set_keys"
    );
});

test("refuses to steal a combo that is already owned", () => {
    assert.match(src, /owners/);
    assert.match(src, /CONFLICT/);
});

test("check mode never writes", () => {
    // --check must bail out before the set_keys call, so assert the ordering
    // rather than a brittle fixed-width slice.
    const branch = src.indexOf("if check_only");
    const bail = src.indexOf("continue", branch);
    const write = src.indexOf("set_keys", branch);
    assert.ok(branch > -1, "expected a check_only branch");
    assert.ok(bail > branch, "check branch must continue (skip the write)");
    assert.ok(write > bail, "set_keys must come after the check-only bail");
});
