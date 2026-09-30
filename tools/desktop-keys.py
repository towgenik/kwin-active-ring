#!/usr/bin/env python3
"""Apply and verify the desktop-navigation keybindings.

The digit form (`Meta+Shift+2` to move a window to desktop 2) cannot be
verified on this machine: no synthetic key injector can deliver Shift+digit
(see README, "Keywatch"), and it duplicates nothing that the arrow chords
do not already do. So the arrow family is the primary mapping, and the digit
bindings are kept only for Omarchy parity.

Idempotent: safe to re-run. Refuses to bind a combo that is already owned.
"""

import importlib.util
import sys
from pathlib import Path

HELPER = Path.home() / ".local/share/kwin/scripts/hyprkwin/contents/tools/hyprkwin-shortcuts.py"

# action name -> combo. Mirrors the Meta+Shift+<arrow> family the user already
# knows from the tiler: bare = change focus, Shift = move the window with it.
BINDINGS = {
    # follow-focus desktop switching
    "Switch One Desktop to the Left": "Meta+Ctrl+Left",
    "Switch One Desktop to the Right": "Meta+Ctrl+Right",
    "Switch One Desktop Up": "Meta+Ctrl+Up",
    "Switch One Desktop Down": "Meta+Ctrl+Down",
    # move the focused window to the neighbouring desktop, follow it
    "Window One Desktop to the Left": "Meta+Shift+Ctrl+Left",
    "Window One Desktop to the Right": "Meta+Shift+Ctrl+Right",
    "Window One Desktop Up": "Meta+Shift+Ctrl+Up",
    "Window One Desktop Down": "Meta+Shift+Ctrl+Down",
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
    check_only = "--check" in sys.argv
    hks = load_helper()
    accel = hks.Accel()
    infos = {i["name"]: i for i in accel.infos("kwin")}

    missing = [a for a in BINDINGS if a not in infos]
    if missing:
        sys.exit("KWin does not offer: " + ", ".join(missing))

    rc = 0
    for action, combo in BINDINGS.items():
        code = hks.key_code(combo)
        owners = [o["friendly"] for o in accel.owners(code)]
        current = infos[action]["keys"]
        want = [code]

        if current == want:
            print(f"  ok      {action:<36} {combo}")
            continue
        if owners:
            print(f"  CONFLICT {action:<36} {combo} also owned by {', '.join(owners)}")
            rc = 1
            continue
        if check_only:
            print(f"  MISSING {action:<36} {combo} (currently {hks.keys_str(current)})")
            rc = 1
            continue
        accel.set_keys(infos[action], want)
        print(f"  bound   {action:<36} {combo}")

    # The digit bindings are informational only: present for Omarchy parity,
    # not relied upon.
    print("  -- Omarchy digit parity (unverifiable here, kept for compatibility):")
    for n in range(1, 5):
        a = infos.get("Window to Desktop %d" % n)
        if a and a["keys"]:
            print("     Window to Desktop %d = %s" % (n, hks.keys_str(a["keys"])))
    return rc


if __name__ == "__main__":
    sys.exit(main())
