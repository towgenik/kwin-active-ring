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
        // Signal-driven: one dock event in, one arrange out. No polling.
        //
        // The arrange is DEFERRED, and that is the whole trick. windowRemoved
        // fires while the dock is still counted in the screen's exclusive
        // zone, so arranging inline re-reads the *old* work area and changes
        // nothing -- arranging straight from the handler is a silent no-op.
        // The tiler already defers the same way for geometry settles
        // (enforceSize, 10ms) and upstream defers client.windowShown by 50ms.
        //
        // Config (kwinrc, [Script-krohnkite]), read at event time so it can be
        // tuned live without editing this file or restarting KWin:
        //   dockRearrangeDelayMs  deferral before arranging, default 60
        //   dockRearrangeProbe    true to log when the work area settles
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
            console.log("AR dock event, workArea inline = " + readArea()
                + ", delay = " + delay + "ms");
            // Opt-in: sample the settle curve so the delay is set from data
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
            this.setTimeout(() => {{
                console.log("AR dock deferred +" + delay + "ms, workArea = " + readArea());
                this.control.onSurfaceUpdate(this);
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
