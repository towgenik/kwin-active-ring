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
import xml.etree.ElementTree as ET
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


# The KCM binds widgets to keys by name: a widget called kcfg_<Key> is bound to
# the config key <Key>. So a widget with no key silently does nothing, and a
# key with no widget is unreachable from the GUI. Both are checked here.
CONFIG_UI = PKG / "contents" / "ui" / "config.ui"
KCFG_NS = "{http://www.kde.org/standards/kcfg/1.0}"
WIDGET_FOR_TYPE = {
    "Bool": "QCheckBox",
    "Int": "QSpinBox",
    "String": "QLineEdit",
    "Color": "KColorButton",
}


def check_config_form():
    if not CONFIG_UI.exists():
        errors.append("contents/ui/config.ui missing: no configuration GUI")
        return
    ui = CONFIG_UI.read_text()

    for f in (MAINXML, CONFIG_UI):
        try:
            ET.parse(f)
        except ET.ParseError as exc:
            errors.append(f"{f.name}: not well-formed XML ({exc})")
            return

    kinds = dict(
        (name, cls)
        for cls, name in re.findall(
            r'<widget class="(\w+)" name="kcfg_(\w+)"', ui, re.S)
    )
    root = ET.parse(MAINXML).getroot()
    entries = list(root.iter(KCFG_NS + "entry"))
    declared = {e.get("name") for e in entries}

    # BuildId is written by the installer, never shown or edited.
    internal = {"BuildId"}

    for name in sorted(set(kinds) - declared - internal):
        errors.append(f"config.ui binds kcfg_{name} but main.xml has no such entry")
    for name in sorted(declared - set(kinds) - internal):
        errors.append(f"main.xml entry {name} has no kcfg_ widget: unreachable from the GUI")

    for e in entries:
        name, typ = e.get("name"), e.get("type")
        if name in internal or name not in kinds:
            continue
        choices = e.find(KCFG_NS + "choices")
        want = "QComboBox" if choices is not None else WIDGET_FOR_TYPE.get(typ)
        got = kinds[name]
        if want and got != want:
            errors.append(
                f"{name}: type {typ} should use a {want}, config.ui uses a {got}")
        if choices is None:
            continue
        # An Int with <choices> is bound to a combo by item index, so the item
        # count has to match or the stored value means something else.
        n_choices = len(choices.findall(KCFG_NS + "choice"))
        m = re.search(
            r'<widget class="QComboBox" name="kcfg_%s".*?</widget>' % re.escape(name),
            ui, re.S)
        n_items = len(re.findall(r"<item>", m.group(0))) if m else -1
        if n_choices != n_items:
            errors.append(
                f"{name}: {n_choices} <choice> but {n_items} combo items; "
                f"the combo is bound by index so these must match")


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
        check_config_form()
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
