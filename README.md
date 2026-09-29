# kwin-active-ring

Tiler-agnostic Hyprland-style focus ring overlays for KWin (Plasma 6).

Draws a colored ring in the gap around ordinary windows — SSD or CSD alike —
as overlay windows. The drawing (`Border.qml`, `BorderStrip.qml`) and the
appearance model are extracted from
[HyprKwin](https://github.com/DGBooth/HyprKwin); the layout engine, groups,
shortcuts, and animations are deliberately left behind.

## Why not a window decoration?

KDecoration plugins only wrap SSD windows. CSD windows (Chromium, Electron,
GTK header bars) draw their own frames, so no decoration can outline them.
Overlay windows in the gap work for both — that is the one capability stolen
here.

## Compatibility

- Works with any tiler (Krohnkite, HyprKwin with its own borders off, or no
  tiler at all) or none.
- The `hyprkwinanimations` KWin effect picks the rings up with no changes:
  overlay windows keep the title `HyprKwin overlay`, and synchronous updates
  land inside its 80ms `overlayGrace` window, so rings animate with their
  windows (generic Translation + Size; HyprKwin's divider-slide clips are
  HyprKwin-specific and do not apply).
- Do **not** run HyprKwin's own borders at the same time (its `BorderSize=0`
  or `FocusIndicator=2`): both scripts would draw rings from the same title.

## Settings (System Settings > Window Management > KWin Scripts > Active Ring)

- `BorderSize` (default 4), `BorderRadius` (default 4)
- `ActiveBorderSource`: 0 = colour scheme accent, 1 = custom, 2 = gradient
- `ActiveBorderColor`, `ActiveBorderColor2`, `BorderGradientAngle`, `BorderGradientSpin`
- `InactiveBorderSource`, `InactiveBorderColor`, `ShowInactiveBorders`
- `BorderOnUndecorated`, `Debug`

## Install / upgrade

KWin caches a script's QML by path for as long as it runs. After
re-installing, either log out and back in or restart KWin; toggling the
script in System Settings also reloads it.

```
kpackagetool6 --type=KWin/Script --install package
# or: kpackagetool6 --type=KWin/Script --upgrade package
```

## Status

v0.1.0: active + inactive rings, solid + gradient + spin, popup/occlusion
cull. No opacity handling, no layout widgets.
