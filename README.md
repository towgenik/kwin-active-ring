# Active Ring

Tiler-agnostic Hyprland-style focus rings for KWin (Plasma 6.6+), drawn as
overlay windows in the gap around each window. Works on SSD **and** CSD
alike — unlike window decorations, which never reach client-drawn windows
(Brave, Discord, Electron, GTK CSD).

Use it with any tiler (Krohnkite, HyprKwin with its own borders off, or none)
plus the standalone `hyprkwinanimations` effect for resize/move animations.

Border drawing adapted from [HyprKwin](https://github.com/DGBooth/HyprKwin)
(GPL-3.0-or-later, by dgbooth). Tracker rewritten tiler-agnostic.

## Install

```bash
tools/install.sh            # install/upgrade, enable, reload
tools/install.sh --no-enable
```

Each install goes into a build-stamped folder so KWin picks up the new code
without logging out.

## Configure

System Settings → Window Management → KWin Scripts → Active Ring, or
`kwinrc [Script-active-ring]`: `BorderSize` (default 4), `BorderRadius`
(default 4), active/inactive sources and colors, gradient angle/spin,
`ShowInactiveBorders`, `BorderOnUndecorated` (default true),
`DrawOnDecorated` (default false: skip windows that already have a
server-side frame, so the two styles never stack).

## Debug

```bash
tools/ring-debug.sh on|verbose|off   # flip Debug keys + reconfigure
tools/ring-debug.sh watch            # follow Ring: lines
tools/ring-debug.sh snapshot [file]  # capture journal slice
```

## Probe

Read-only snapshot of the whole picture: which window is on which desktop,
where every window is, the work area, and the stacking order (which is what
decides who covers whom).

```bash
tools/probe.sh            # one snapshot
tools/probe.sh --watch    # re-snapshot every 2s
```

```
SNAP cur=D1 active=org.kde.konsole workArea=0,28 1920x1052 fullArea=0,0 1920x1080 screens=1
SNAP  0 plasmashell [desktop-shell,desktopWindow] @0,0 1920x1080 desk=ALL
SNAP  1 brave-origin @8,36 1904x1036 desk=D2 min=500x150
SNAP  2 discord @964,36 948x1036 desk=D1 min=800x500
SNAP  3 org.kde.konsole @8,36 948x1036 desk=D1 min=150x150
SNAP  4 plasmashell [dock] @0,0 1920x44 desk=ALL
SNAP  8 overlay [overlay] @4,36 4x1036 desk=ALL
```

Stack index runs bottom to top, so a later row covers an earlier one. It
never mutates anything (enforced by `tests/probe.test.mjs`).

The last line is an overlap check:

```
SNAP ok: no overlap
```

Two *large* windows sharing space means the tiler has wedged — the failure
that otherwise shows up as "my windows look wrong" with nothing logged
anywhere, and whose only reliable cure is a session restart. Small floating
dialogs are ignored, since those overlapping a tile is normal.

## Panel toggle re-tiles (patch to the tiler)

```bash
tools/patch-tiler-docksignal.py --apply    # insert the binding (idempotent)
tools/patch-tiler-docksignal.py --check    # non-zero when missing, gates CI
tools/patch-tiler-docksignal.py --revert
```

Toggling the panel releases (or restores) its exclusive zone, the work area
changes, and the tiles keep their old size. Signal-driven, no polling.

**Why a patch is needed.** KWin on Plasma 6.6 has no work-area signal. There
is no `clientAreaChanged` and no `screenResized` on `Workspace` — both are
`undefined`. Probing every candidate signal:

| present | absent |
|---|---|
| `windowAdded`, `windowRemoved` | `clientAreaChanged` |
| `screensChanged` | `screenResized` |
| `virtualScreenGeometryChanged` | `numberScreensChanged` |
| `currentDesktopChanged` | `windowsChanged`, `windowListChanged` |
| `desktopsChanged`, `currentActivityChanged` | `numberDesktopsChanged` |

Hiding the panel emits exactly one thing, verified live:

```
DOCK REMOVED class=plasmashell dock=true
DOCK ADDED   class=plasmashell dock=true
```

The tiler's only re-arrange hook is `onSurfaceUpdate`, and upstream binds it
to just `screensChanged`, `virtualScreenGeometryChanged`,
`currentDesktopChanged` and `currentActivityChanged` — none of which fire on
a dock change. The patch routes dock add/remove to that same hook.

There is no way to do this from outside. Every tiler *shortcut* ends in a
blanket `arrange(ctx)`, but every shortcut also has a side effect;
`windowActivated` only stamps a timestamp; re-setting the active window does
not re-emit. So the change has to go where the bindings are.

It filters on `client.dock`, so opening a menu or a tray popup — also
`plasmashell`, but not a dock — does not trigger a re-tile.

### The arrange has to be deferred, and that is the whole fix

The first version called `onSurfaceUpdate` straight from the handler and it
was a **silent no-op**, even after a KWin restart. `windowRemoved` fires while
the dock is still counted in the screen's exclusive zone, so arranging inline
re-reads the *old* work area, computes the same geometry, and nothing moves.

The patch defers the arrange by 60ms instead:

```js
this.setTimeout(() => this.control.onSurfaceUpdate(this), 60);
```

One dock event in, one arrange out. That is a one-shot deferral, not a poll —
there is no interval and nothing re-checks. It is also how the tiler already
handles geometry settles (`enforceSize`, 10ms) and how upstream defers
`client.windowShown` (50ms).

The block logs the work area both inline and after the deferral, so if this
ever stops working the journal says whether the inline read was stale and
whether the deferred read differed, instead of failing silently the way v1
did:

```
AR dock event, workArea inline = 28,1052
AR dock deferred, workArea = 0,1080
```

```
journalctl --user -u plasma-kwin_wayland -f | grep 'AR dock'
```

### The alternative: make the work area stop changing

Read from upstream sources, there is a config-only answer that removes the
need for the patch entirely. `plasma-panel-colorizer` writes native Plasma
panel properties (`package/contents/ui/code/utils.js`, `setPanelModeScript`):

```js
panel.hiding   = "<visibility>"   // Plasma::Panel::Hiding
panel.floating = <bool>           // Plasma::Panel::floating
panel.height   = <thickness>
```

`stockPanelSettings.visibility` is `panel.hiding`, and Plasma's `AutoHide`
reserves no space. Measured:

```
docked panel, Meta+Shift+Space:   workArea 0,28 1920x1052  <->  0,0 1920x1080
stockPanelSettings.visibility = "autohide":  0,0 1920x1080  <->  0,0 1920x1080
```

With `autohide` the work area is constant, so there is nothing to re-tile and
no signal to send. `stockPanelSettings.floating = true` did **not** help --
the exclusive zone stayed at 28, verified.

The trade-off: the panel then overlays window content, so it covers the top
edge of a full-height tile (and that tile's ring strip). Keeping the panel
docked and patching the tiler keeps the ring visible and resizes the tiles.
Pick whichever you prefer; they are not combinable.

Also worth knowing: the tiler re-arranges on window add/remove, and each
arrange re-reads the work area -- `get screens()` builds fresh `KWinSurface`
objects, and each constructor re-reads `workspace.clientArea`. That is why
opening and closing any window repairs a stale layout, and why the
dock add/remove hook is sufficient: it needs a re-arrange, nothing more.

### Upstream status

Current upstream (`esjeon/krohnkite`, `src/driver/kwin/kwindriver.ts`) has
**the same gap** -- it binds `numberScreensChanged`, `screenResized`,
`currentActivityChanged`, `currentDesktopChanged`, `clientAdded` and
`clientRemoved`, and no dock or exclusive-zone signal. It is a TypeScript
rewrite; the installed 0.9.9.2 is the older compiled JS. So this is worth
reporting rather than patching silently.

### Loading the patched tiler

The tiler's JS is a QML `import`, and it is cached in memory in a way that
survives `org.kde.KWin.reconfigure` and clearing `~/.cache/kwin/qmlcache`. To
load the patch, restart KWin (or the session) after applying. A tiler update
overwrites the file; re-run `--apply` and restart.

## Keywatch

Records which global shortcut KWin actually receives, so you can tell
"not bound at all" from "bound to the wrong action".

```bash
tools/keywatch.sh 20     # start it, then press the keys
```

```
watching 20s -- press your shortcut now
  kwin/KrohnkiteMonocleLayout
--- done ---
```

Needed because no synthetic key injector can verify a binding on this
machine:

| Path | Status |
|---|---|
| `ydotool` (uinput) | works, except `Shift`+`digit`, which never arrives (0/10) |
| `cua-driver` (libei + portal) | `RemoteDesktop` is stripped from `kde.portal`, so libei never initialises |
| `wtype` (`zwp_virtual_keyboard_v1`) | KWin does not expose that global |

A real keyboard is the only remaining source.

## Desktop navigation keys

The digit form (`Meta+Shift+2` to move a window to desktop 2) duplicates
what the arrow family already does, and it is the one form that cannot be
verified on this machine. So the arrows are primary, and the digits are kept
only for Omarchy parity.

```bash
tools/desktop-keys.py            # apply (idempotent)
tools/desktop-keys.py --check    # verify only, never writes
```

| Combo | Action |
|---|---|
| `Meta+Ctrl+Left` / `Right` | switch to the desktop left / right |
| `Meta+Ctrl+Up` / `Down` | switch to the desktop above / below |
| `Meta+Shift+Ctrl+Left` / `Right` | **move** the window to that desktop, follow it |
| `Meta+Shift+Ctrl+Up` / `Down` | same, vertically |

The pattern matches the tiler's: bare combo moves focus, `Shift` carries the
window along. Verified end to end — `Meta+Shift+Ctrl+Right` moved a window
from desktop 2 to 3 and followed it.

## Resize keys

```bash
tools/resize-keys.py
```

| Combo | Action |
|---|---|
| `Meta+Alt+Left` / `Right` | shrink / grow width |
| `Meta+Alt+Up` / `Down` | shrink / grow height |
| `Meta+-` / `Meta+=` | secondary, width only |

Alt carries the resize because the bare arrows are already focus
(`Meta+<arrow>`) and window-move (`Meta+Shift+<arrow>`), which leaves the
family readable at a glance:

```
Meta+<arrow>             focus
Meta+Shift+<arrow>       move the window
Meta+Alt+<arrow>         resize
Meta+Ctrl+<arrow>        change desktop
Meta+Shift+Ctrl+<arrow>  move the window to another desktop
```

`Meta+-` / `Meta+=` are kept as a secondary because they are plain
(unshifted) keysyms and do deliver. The shifted height pair
`Meta+Shift+-` / `Meta+Shift+=` is deliberately **not** bound: those encode
to `Key_Underscore` / `Key_Plus` with no Shift bit, the dead form behind
HyprKwin's `Meta+!` bug.

### Known upstream bug: resize overlaps windows

The keys fire and the tiler acts on them, but the tiler's resize does not
reflow siblings. Its `resizeTile` delegates to `layout.adjust` with a step of
3% of the work area, and in the layout in use the focused window grows while
its neighbours stay put:

```
start   konsole @12,40  940x1028   discord @968,40  940x1028
grow 1  konsole @12,40 1036x1028   discord @968,40  940x1028
grow 2  konsole @12,40 1132x1028   discord @968,40  940x1028
grow 3  konsole @12,40 1228x1028   discord @968,40  940x1028
grow 4  konsole @12,40 1324x1028   discord @968,40  940x1028   <- 368px overlap
```

Under the Columns layout it does reflow, but moves the divider the wrong way
— it grows the *other* window into the focused one instead. So this is an
upstream tiler bug, not a keybinding problem, and the hotkeys are not the
thing to fix.

## Testing safety

While testing, HyprKwin's own borders MUST be off (`hyprkwinEnabled=false`,
or its `BorderSize=0`): two overlay systems share the `HyprKwin overlay`
title (kept deliberately so the animations effect picks rings up) and will
fight over the same windows.

## CI

GitHub Actions on every push: JS/Python/shell syntax, headless geometry
unit tests (`node --test tests/`), package validation
(`tools/validate_package.py`). Nothing touches a live compositor until green.

## License

GPL-3.0-or-later, same as the HyprKwin code this is adapted from.
