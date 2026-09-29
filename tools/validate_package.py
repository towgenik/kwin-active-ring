#!/usr/bin/env python3
"""Validate the Active Ring KWin package without a live compositor.

Checks:
  1. package/metadata.json: KWin/Script structure, unique Id (must not be
     "hyprkwin"), main script path exists.
  2. Every readConfig() key in code/borders.js has a matching entry in
     config/main.xml (a missing entry means KWin falls back silently).
  3. QML files: balanced braces and required imports (--qml-only runs just this).
  4. No shifted-symbol shortcut strings (the Meta+! bug class): this script
     registers no shortcuts; fail if one appears.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PKG = ROOT / "package"
CODE = PKG / "contents" / "code" / "borders.js"
MAINXML = PKG / "contents" / "config" / "main.xml"
META = PKG / "metadata.json"
QML_FILES = sorted((PKG / "contents" / "ui").glob("*.qml"))

errors = []


def check_metadata():
    try:
        meta = json.loads(META.read_text())
    except Exception as e:
        errors.append(f"metadata.json unreadable: {e}")
        return
    if meta.get("KPackageStructure") != "KWin/Script":
        errors.append("metadata KPackageStructure != KWin/Script")
    plugin = meta.get("KPlugin", {})
    if plugin.get("Id") in (None, "", "hyprkwin"):
        errors.append(f'metadata KPlugin.Id must be set and != "hyprkwin" (got {plugin.get("Id")!r})')
    main = meta.get("X-Plasma-MainScript", "")
    if not (PKG / "contents" / main).exists():
        errors.append(f"X-Plasma-MainScript target missing: {main}")


def check_config_keys():
    src = CODE.read_text()
    used = set(re.findall(r'rc\("([A-Za-z0-9_]+)"', src))
    xml = MAINXML.read_text()
    declared = set(re.findall(r'<entry name="([A-Za-z0-9_]+)"', xml))
    for key in sorted(used):
        if key not in declared:
            errors.append(f'readConfig("{key}") has no entry in config/main.xml')


def check_qml():
    for f in QML_FILES:
        src = f.read_text()
        if src.count("{") != src.count("}"):
            errors.append(f"{f.name}: unbalanced braces")
        for imp in ("import QtQuick",):
            if imp not in src and f.name in ("Ring.qml", "Border.qml", "BorderStrip.qml"):
                errors.append(f"{f.name}: missing '{imp}'")
    border = (PKG / "contents" / "ui" / "BorderStrip.qml").read_text()
    if 'title: "HyprKwin overlay"' not in border:
        errors.append("BorderStrip.qml overlay title changed; hyprkwinanimations effect will not animate rings")
    ring = (PKG / "contents" / "ui" / "Ring.qml").read_text()
    if "isEffectActive" not in ring:
        errors.append("Ring.qml does not poll effect state; strips will stick during gesture slides/Overview")
    if "root.effectActive || root.shuttingDown" not in ring:
        errors.append("Ring.qml overlaysHidden binding ignores effectActive")


def check_no_shortcuts():
    src = CODE.read_text()
    bad = re.compile(r"Meta\+[!@#$%^&*()_<>+]")
    for i, line in enumerate(src.splitlines(), 1):
        if line.strip().startswith(("//", "*")):
            continue
        if bad.search(line):
            errors.append(f"borders.js:{i}: shifted-symbol shortcut form: {line.strip()}")


def main():
    only_qml = "--qml-only" in sys.argv
    if only_qml:
        check_qml()
    else:
        check_metadata()
        check_config_keys()
        check_qml()
        check_no_shortcuts()
    if errors:
        print("validate_package FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("validate_package OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
