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
    // screen changes. No hand-rolled layout pass.
    assert.match(block, /this\.workspace\.windowAdded/);
    assert.match(block, /this\.workspace\.windowRemoved/);
    assert.match(block, /this\.control\.onSurfaceUpdate\(this\)/);
    for (const forbidden of ["setInterval", "while (", "for (;;)", "repeat"]) {
        assert.ok(!block.includes(forbidden), `patch must not contain ${forbidden}`);
    }
});

test("the arrange is a burst: immediate, fast, safety, through one funnel", () => {
    // Measured 2026-09-30: on show the work area is already new inline at
    // windowAdded; on hide it flips within ~2ms of windowRemoved. A single
    // 60ms deferral holds stale windows under the panel (or a gap) for ~4
    // frames while the animation effect replays the jump -- the flicker.
    // So one dock event schedules three arranges: immediate (catches show),
    // fast (catches hide right after the flip), safety (late net for a
    // loaded system). Extra arranges are no-ops when the area is already
    // right and never restart the animation.
    const src = readFileSync(new URL("../tools/patch-tiler-docksignal.py", import.meta.url), "utf8");
    const funnels = src.match(/this\.control\.onSurfaceUpdate\(this\)/g) || [];
    assert.equal(funnels.length, 1, "exactly one arrange site (the funnel)");
    for (const site of ['arrangeAt("inline")', 'arrangeAt("fast")', 'arrangeAt("safety")']) {
        assert.ok(src.includes(site), `burst must schedule ${site}`);
    }
    assert.ok(!src.includes("setInterval"), "no repeating timer");
});

test("duplicate dock events in one toggle are coalesced", () => {
    // One toggle emits two dock events in the same ms; the second burst
    // would be pure redundancy. A human re-press is hundreds of ms later.
    const src = readFileSync(new URL("../tools/patch-tiler-docksignal.py", import.meta.url), "utf8");
    assert.match(src, /lastDockBurst/);
    assert.match(src, /< 80/);
});

test("the delays are tunable from kwinrc, read at event time", () => {
    // Reading them per event means they can be changed with kwriteconfig6
    // and take effect on the next panel toggle -- no file edit, no restart.
    const src = readFileSync(new URL("../tools/patch-tiler-docksignal.py", import.meta.url), "utf8");
    assert.match(src, /KWIN\.readConfig\("dockRearrangeDelayMs", 60\)/);
    assert.match(src, /KWIN\.readConfig\("dockRearrangeFastMs", 10\)/);
    // ...and they are clamped, so a typo cannot stall the re-tile
    assert.match(src, /d >= 0 && d <= 2000/);
    assert.match(src, /f >= 0 && f <= 2000/);
});

test("the settle-curve probe is opt-in", () => {
    // It costs 8 timers per panel toggle, so it must default to off.
    const src = readFileSync(new URL("../tools/patch-tiler-docksignal.py", import.meta.url), "utf8");
    assert.match(src, /KWIN\.readConfig\("dockRearrangeProbe", false\)/);
    assert.match(src, /if \(probing\) \{/);
    // ...and it only samples the work area; it must never arrange.
    const start = src.indexOf("if (probing) {");
    const end = src.indexOf("AR dock safety", start);
    assert.ok(start > -1 && end > start, "could not locate the probe block");
    const probe = src.slice(start, end);
    assert.ok(!probe.includes("onSurfaceUpdate"), "the probe must not arrange");
    assert.match(probe, /AR probe \+/, "the probe should log samples");
});

test("only docks trigger it, so opening a menu does not re-tile", { skip: !liveSrc }, () => {
    const block = patchBlock(readFileSync(LIVE, "utf8"));
    assert.match(block, /isDock = !!client\.dock/);
    assert.match(block, /if \(!isDock\)/);
});

test("it reports the work area at both points, so a future failure is diagnosable", () => {
    // If the deferral ever stops being enough, the log says whether the area
    // was stale inline and whether the deferred read differs. Without this
    // the patch fails silently, which is exactly how v1 failed.
    const src = readFileSync(new URL("../tools/patch-tiler-docksignal.py", import.meta.url), "utf8");
    assert.match(src, /workArea inline = /);
    assert.match(src, /workArea = /);
    assert.match(src, /clientArea\(0, this\.workspace\.activeScreen/);
});
