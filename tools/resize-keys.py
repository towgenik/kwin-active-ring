#!/usr/bin/env python3
"""Apply and verify the tiler resize keybindings.

Hyprland/Omarchy convention: SUPER+ALT+ARROW resizes. Bare arrows are already
taken by the tiler's focus movement, and Meta+Shift+<arrow> by window moving,
so Alt carries the resize -- which also keeps the whole arrow family readable:

    Meta+<arrow>            focus
    Meta+Shift+<arrow>      move the window
    Meta+Alt+<arrow>        resize
    Meta+Ctrl+<arrow>       change desktop
    Meta+Shift+Ctrl+<arrow> move the window to another desktop

Idempotent. Refuses to bind a combo that is already owned.
"""

import importlib.util
import sys
from pathlib import Path

HELPER = Path.home() / ".local/share/kwin/scripts/hyprkwin/contents/tools/hyprkwin-shortcuts.py"

BINDINGS = {
    "KrohnkiteShrinkWidth": "Meta+Alt+Left",
    # KWin registered this action with a lowercase 'g'. Not a typo on our side.
    "KrohnkitegrowWidth": "Meta+Alt+Right",
    "KrohnkiteShrinkHeight": "Meta+Alt+Up",
    "KrohnkiteGrowHeight": "Meta+Alt+Down",
}

# Kept as a secondary, because Meta+-/Meta+= are plain (unshifted) keysyms and
# so do deliver. The shifted height pair (Meta+Shift+- / Meta+Shift+=) does not:
# it encodes to Key_Underscore/Key_Plus with no Shift bit, the same dead form
# as HyprKwin's Meta+!. The arrows above are the primary mapping.
LEGACY_WIDTH = {
    "KrohnkiteShrinkWidth": "Meta+-",
    "KrohnkitegrowWidth": "Meta+=",
}


def load_helper():
    if not HELPER.exists():
        sys.exit(f"missing {HELPER}")
    spec = importlib.util.spec_from_file_location("hks", HELPER)
    mod = importlib.util.module_from_spec(spec)
    sys.argv = ["hks", "check"]
    spec.loader.exec_module(mod)
    return mod


def main():
    hks = load_helper()
    accel = hks.Accel()
    infos = {i["name"]: i for i in accel.infos("kwin")}

    # Multi-key sequences: [primary, secondary, ...] in preference order.
    plan = {}
    for action, combo in BINDINGS.items():
        plan.setdefault(action, []).append(combo)
    for action, combo in LEGACY_WIDTH.items():
        plan.setdefault(action, []).append(combo)

    missing = [a for a in plan if a not in infos]
    if missing:
        sys.exit("tiler does not offer: " + ", ".join(missing))

    for action, combos in plan.items():
        codes = [hks.key_code(c) for c in combos]
        # kglobalaccel does not preserve the order keys were written in, so
        # compare as sets -- otherwise this rewrites on every run.
        if set(infos[action]["keys"]) == set(codes):
            print(f"  ok      {action:<24} {' / '.join(hks.key_name(c) for c in infos[action]['keys'])}")
            continue
        # An action always "owns" its own current binding, so only a *different*
        # action holding the combo is a real conflict.
        mine = infos[action]["friendly"]
        clash = {
            c: [o for o in (x["friendly"] for x in accel.owners(hks.key_code(c))) if o != mine]
            for c in combos
        }
        clash = {c: o for c, o in clash.items() if o}
        if clash:
            print(f"  CONFLICT {action:<24} {clash}")
            continue
        accel.set_keys(infos[action], codes)
        print(f"  bound   {action:<24} {' / '.join(combos)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
