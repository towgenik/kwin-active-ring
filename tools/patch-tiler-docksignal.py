#!/usr/bin/env python3
"""Teach the tiler to re-tile when a dock (the panel) changes its exclusive zone.

The bug
-------
KWin on Plasma 6.6 has **no** work-area / exclusive-zone signal. There is no
`clientAreaChanged` and no `screenResized` on `Workspace`; both are undefined.
Verified by probing every candidate:

    present : windowAdded, windowRemoved, screensChanged,
              virtualScreenGeometryChanged, currentDesktopChanged,
              desktopsChanged, currentActivityChanged, windowActivated
    absent  : clientAreaChanged, screenResized, numberScreensChanged,
              windowsChanged, windowListChanged, numberDesktopsChanged, ...

Hiding the panel therefore emits exactly one thing: `windowRemoved` for the
panel's window (and `windowAdded` when it comes back).

The tiler's only re-arrange hook is `onSurfaceUpdate`, and upstream binds it
to just four signals -- none of which fire on a dock change:

    workspace.screensChanged
    workspace.virtualScreenGeometryChanged
    workspace.currentDesktopChanged
    workspace.currentActivityChanged

So toggling the panel releases (or restores) the exclusive zone, the work area
changes, and the tiles keep their old size. HyprKwin used to paper over this
with a 100ms poll of the work area; that poll is why its fix does not exist
here, and the user has asked for no polling.

The fix
-------
Route dock add/remove to the *same* hook the tiler already uses for screen
changes. That is signal-driven: one event in, one arrange out, nothing
watching anything.

There is no external way to do this. Every tiler *shortcut* ends in a blanket
`arrange(ctx)`, but every shortcut also has a side effect; `windowActivated`
only stamps a timestamp; and re-setting the active window does not re-emit.
So the change has to go where the bindings are.

    --apply    insert the binding (idempotent)
    --check    report whether it is applied, without writing
    --revert   remove it again

Re-run --apply after a tiler update, which will overwrite the file. --check
exits non-zero when the patch is missing, so it can gate a check.
"""

import argparse
import sys
from pathlib import Path

MARKER = "active-ring patch: re-tile on dock exclusive-zone change"

# KWin script dirs, most specific first.
CANDIDATES = [
    Path.home() / ".local/share/kwin/scripts/krohnkite/contents/code/script.js",
    Path.home() / ".local/share/kwin/scripts/krohnkite/contents/code/main.js",
]

# Insert immediately before this, which is the end of bindEvents(). Unique in
# the file, so the anchor cannot drift onto the wrong function.
ANCHOR = "    }\n    bindWindowEvents(window, client) {"

BINDING = f"""        // --- {MARKER} ---
        // KWin 6.6 has no exclusive-zone signal; a panel show/hide emits only
        // windowAdded/windowRemoved. Upstream never routes those to
        // onSurfaceUpdate, so the tiles keep their old size after the work
        // area changes.
        //
        // Signal-driven: one dock event in, arranges out. No polling.
        //
        // The zone settles fast but NOT atomically (measured 2026-09-30,
        // eDP-1 1920x1080, top panel 28px): on show it reads new inline at
        // windowAdded, but it passes through a transitional shape first (top
        // moved, height not yet shrunk, bottom off-screen); on hide it flips
        // within ~2ms of windowRemoved. Arranging at 0ms commits that bogus
        // intermediate geometry, and the animation effect then slides the
        // window down 28px over 200ms before snapping the height back -- the
        // bottom-of-the-screen flicker. So there is deliberately NO immediate
        // arrange: only a fast one past the transition and a safety net for
        // a loaded system. A single 60ms deferral alone would hold stale
        // windows under the panel (show) or a gap (hide) for ~4 frames, so
        // the fast arrange is what the eye sees. Extra arranges are no-ops
        // when the area is already right: unchanged geometry emits no
        // signal, so the animation does not restart.
        //
        // Duplicate dock events arrive in the same ms for one toggle, so a
        // second burst inside 80ms is coalesced away; a human re-press is
        // hundreds of ms later and is unaffected.
        //
        // Config (kwinrc, [Script-krohnkite]), read at event time so it can be
        // tuned live without editing this file or restarting KWin:
        //   dockRearrangeDelayMs  safety arrange, default 60
        //   dockRearrangeFastMs   fast catch-up arrange, default 10
        //   dockRearrangeProbe    true to log when the work area settles
        let lastDockBurst = 0;
        const dockSurfaceChanged = (client) => {{
            if (!client)
                return;
            let isDock = false;
            try {{
                isDock = !!client.dock;
            }}
            catch (e) {{}}
            if (!isDock)
                return;
            const now = Date.now();
            if (now - lastDockBurst < 80) {{
                console.log("AR dock event coalesced (duplicate of the same toggle)");
                return;
            }}
            lastDockBurst = now;
            const readArea = () => {{
                const a = this.workspace.clientArea(0, this.workspace.activeScreen,
                    this.workspace.currentDesktop);
                return a.y + "," + a.height;
            }};
            let delay = 60;
            try {{
                const d = KWIN.readConfig("dockRearrangeDelayMs", 60);
                if (typeof d === "number" && d >= 0 && d <= 2000)
                    delay = d;
            }}
            catch (e) {{}}
            let fast = 10;
            try {{
                const f = KWIN.readConfig("dockRearrangeFastMs", 10);
                if (typeof f === "number" && f >= 0 && f <= 2000)
                    fast = f;
            }}
            catch (e) {{}}
            console.log("AR dock event, workArea inline = " + readArea()
                + ", fast = " + fast + "ms, safety = " + delay + "ms");
            // Single funnel: every scheduled arrange goes through here, so a
            // no-op (area already right) emits no signal and never restarts
            // the window animation.
            const arrangeAt = (tag) => {{
                this.control.onSurfaceUpdate(this);
            }};
            // Opt-in: sample the settle curve so the delays are set from data
            // rather than guessed. Off by default; 8 timers per toggle.
            let probing = false;
            try {{
                probing = !!KWIN.readConfig("dockRearrangeProbe", false);
            }}
            catch (e) {{}}
            if (probing) {{
                [2, 5, 10, 15, 20, 30, 45, 60].forEach((d) => {{
                    this.setTimeout(() => {{
                        console.log("AR probe +" + d + "ms = " + readArea());
                    }}, d);
                }});
            }}
            this.setTimeout(() => arrangeAt("fast"), fast);
            if (delay !== 0 && delay !== fast)
                this.setTimeout(() => {{
                    console.log("AR dock safety +" + delay + "ms, workArea = " + readArea());
                    arrangeAt("safety");
                }}, delay);
        }};
        this.connect(this.workspace.windowAdded, dockSurfaceChanged);
        this.connect(this.workspace.windowRemoved, dockSurfaceChanged);
"""


def find_script() -> Path:
    for path in CANDIDATES:
        if path.exists():
            return path
    sys.exit("could not find the installed tiler script.js; looked in:\n  "
             + "\n  ".join(str(p) for p in CANDIDATES))


def read(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def write(p: Path, s: str) -> None:
    # Keep the original mode; KWin re-reads this file on reconfigure.
    mode = p.stat().st_mode
    p.write_text(s, encoding="utf-8")
    p.chmod(mode)


def main() -> int:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--apply", action="store_true")
    g.add_argument("--check", action="store_true")
    g.add_argument("--revert", action="store_true")
    args = ap.parse_args()

    path = find_script()
    src = read(path)
    applied = MARKER in src

    if args.check:
        print(f"  {'applied  ' if applied else 'MISSING  '} {path}")
        return 0 if applied else 1

    if args.apply:
        if applied:
            print(f"  already applied  {path}")
            return 0
        if ANCHOR not in src:
            sys.exit(f"anchor not found in {path} -- tiler version changed, "
                     f"re-read bindEvents() and adjust tools/{Path(__file__).name}")
        write(path, src.replace(ANCHOR, BINDING + ANCHOR, 1))
        print(f"  applied  {path}")
        return 0

    # --revert
    if not applied:
        print(f"  not applied  {path}")
        return 0
    start = src.index(f"        // --- {MARKER} ---")
    end = src.index(ANCHOR, start)
    write(path, src[:start] + src[end:])
    print(f"  reverted  {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
