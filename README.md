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
