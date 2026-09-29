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
