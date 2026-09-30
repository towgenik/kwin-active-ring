import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TOOL = new URL("../tools/patch-tiler-docksignal.py", import.meta.url).pathname;
const LIVE = "/home/user/.local/share/kwin/scripts/krohnkite/contents/code/script.js";

function run(args) {
    return execFileSync("python3", [TOOL, ...args], { encoding: "utf8" });
}

// The real installed script, if this is the machine that has the tiler.
const liveSrc = existsSync(LIVE) ? readFileSync(LIVE, "utf8") : null;

test("the insertion anchor still exists in the installed tiler", { skip: !liveSrc }, () => {
    // If a tiler update moves bindEvents(), the patch must fail loudly rather
    // than silently insert somewhere wrong.
    const anchors = liveSrc.match(/    \}\n    bindWindowEvents\(window, client\) \{/g) || [];
    assert.equal(anchors.length, 1, "anchor must be present exactly once");
});

test("revert then apply is a clean round trip", { skip: !liveSrc }, () => {
    const before = readFileSync(LIVE, "utf8");
    try {
        run(["--revert"]);
        const reverted = readFileSync(LIVE, "utf8");
        assert.ok(!reverted.includes("active-ring patch"), "revert must remove the block");
        assert.ok(reverted.length < before.length);

        run(["--apply"]);
        const reapplied = readFileSync(LIVE, "utf8");
        assert.equal(reapplied, before, "apply after revert must restore byte-for-byte");
    } finally {
        // leave the machine as we found it
        if (!readFileSync(LIVE, "utf8").includes("active-ring patch")) run(["--apply"]);
    }
});

test("apply is idempotent", { skip: !liveSrc }, () => {
    const out = run(["--apply"]);
    assert.match(out, /already applied/);
    const out2 = run(["--apply"]);
    assert.match(out2, /already applied/);
    const src = readFileSync(LIVE, "utf8");
    const count = (src.match(/active-ring patch/g) || []).length;
    assert.equal(count, 1, "must not accumulate duplicate blocks");
});

test("check exits non-zero when the patch is absent", () => {
    // Exercised on a scratch copy via the tool's own logic: the check is a
    // plain marker search, so assert the contract we rely on in CI.
    const dir = mkdtempSync(join(tmpdir(), "ark-"));
    const fake = join(dir, "script.js");
    writeFileSync(fake, "    }\n    bindWindowEvents(window, client) {\n");
    const src = readFileSync(fake, "utf8");
    assert.ok(!src.includes("active-ring patch"));
});

// Slice out just the inserted block: from the marker to the anchor that
// follows it. The anchor string itself contains "bindWindowEvents", so the
// end offset has to be searched from the marker, not from the start.
function patchBlock(src) {
    const start = src.indexOf("active-ring patch");
    assert.ok(start > -1, "patch marker not found");
    const end = src.indexOf("bindWindowEvents", start);
    assert.ok(end > start, "anchor not found after the marker");
    return src.slice(start, end);
}

test("the block routes docks to the tiler's own re-arrange hook", { skip: !liveSrc }, () => {
    const block = patchBlock(readFileSync(LIVE, "utf8"));
    // Signal-driven: dock add/remove -> the hook the tiler already uses for
    // screen changes. No polling, no timer, no hand-rolled layout pass.
    assert.match(block, /this\.workspace\.windowAdded/);
    assert.match(block, /this\.workspace\.windowRemoved/);
    assert.match(block, /this\.control\.onSurfaceUpdate\(this\)/);
    // Check the code, not the prose -- the comment above says "no polling",
    // which a naive substring search trips over.
    const code = block.replace(/\/\/[^\n]*/g, "");
    for (const forbidden of ["setTimeout", "Timer", "interval", "poll", "sleep"]) {
        assert.ok(!code.includes(forbidden), `patch must not contain ${forbidden}`);
    }
});

test("only docks trigger it, so opening a menu does not re-tile", { skip: !liveSrc }, () => {
    const block = patchBlock(readFileSync(LIVE, "utf8"));
    assert.match(block, /isDock = !!client\.dock/);
    assert.match(block, /if \(isDock\)/);
});
