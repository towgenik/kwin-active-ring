import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui = readFileSync(new URL("../package/contents/ui/config.ui", import.meta.url), "utf8");
const xml = readFileSync(new URL("../package/contents/config/main.xml", import.meta.url), "utf8");

// The KCM binds by name: a widget called kcfg_<Key> is bound to config key
// <Key>. Everything below protects that contract.
const widgets = new Map(
    [...ui.matchAll(/<widget class="(\w+)" name="kcfg_(\w+)"/g)].map((m) => [m[2], m[1]])
);
const entries = new Map(
    [...xml.matchAll(/<entry name="(\w+)" type="(\w+)"/g)].map((m) => [m[1], m[2]])
);

test("every config key is reachable from the GUI", () => {
    for (const key of entries.keys()) {
        if (key === "BuildId") continue; // written by the installer, never edited
        assert.ok(widgets.has(key), `${key} has no kcfg_ widget, so the GUI cannot set it`);
    }
});

test("every widget binds to a key that exists", () => {
    for (const key of widgets.keys()) {
        assert.ok(entries.has(key), `kcfg_${key} binds to a key main.xml does not declare`);
    }
});

test("each key's widget type matches its type", () => {
    const want = { Bool: "QCheckBox", Int: "QSpinBox", String: "QLineEdit", Color: "KColorButton" };
    for (const [key, type] of entries) {
        if (!widgets.has(key)) continue;
        // An Int with <choices> is a combo, not a spinbox. Bound the match to
        // this entry: an unbounded [\s\S]*? runs into the next entry's choices.
        const block = xml.match(new RegExp(`<entry name="${key}"[\\s\\S]*?</entry>`))[0];
        const expected = block.includes("<choices>") ? "QComboBox" : want[type];
        assert.equal(widgets.get(key), expected, `${key} (${type}) should use a ${expected}`);
    }
});

test("combo items match the number of choices", () => {
    // The combo is bound by item index, so a missing item shifts every value.
    // The lookahead stops the match crossing into the next entry, which would
    // otherwise attribute one key's choices to another key.
    const entryWithChoices =
        /<entry name="(\w+)"(?:(?!<\/entry>)[\s\S])*?<choices>([\s\S]*?)<\/choices>(?:(?!<\/entry>)[\s\S])*?<\/entry>/g;
    for (const [, key, body] of xml.matchAll(entryWithChoices)) {
        const nChoices = (body.match(/<choice\b/g) || []).length;
        const block = ui.match(new RegExp(`<widget class="QComboBox" name="kcfg_${key}"[\\s\\S]*?</widget>`));
        assert.ok(block, `${key} should have a combo`);
        const nItems = (block[0].match(/<item>/g) || []).length;
        assert.equal(nItems, nChoices, `${key}: ${nChoices} choices vs ${nItems} items`);
    }
});

test("KColorButton is declared as a custom widget", () => {
    // It lives in libKF6WidgetsAddons here, not a KF6ColorChooser, so the
    // header has to be the WidgetsAddons one or QUiLoader cannot build it.
    assert.match(ui, /<class>KColorButton<\/class>/);
    assert.match(ui, /<header>kcolorbutton\.h<\/header>/);
    assert.match(ui, /<extends>QPushButton<\/extends>/);
});

test("the form is grouped and labelled, not a bare key list", () => {
    const groups = [...ui.matchAll(/<widget class="QGroupBox" name="\w+">\s*<property name="title"><string>([^<]+)<\/string>/g)]
        .map((m) => m[1]);
    assert.ok(groups.length >= 3, "expected several group boxes, got " + groups.length);

    // A checkbox carries its own caption; everything else needs a QLabel beside
    // it in the same form-layout row.
    for (const [key, cls] of widgets) {
        if (cls === "QCheckBox") {
            const block = ui.match(new RegExp(`<widget class="QCheckBox" name="kcfg_${key}"[\\s\\S]*?</widget>`))[0];
            assert.match(block, /<property name="text"><string>[^<]{4,}<\/string>/, `${key} has no caption`);
            continue;
        }
        assert.match(
            ui,
            new RegExp(
                `<item row="\\d+" column="0"[^>]*>[\\s\\S]{0,400}?<string>[^<]*:</string>[\\s\\S]*?</item>\\s*` +
                `<item row="\\d+" column="1">[\\s\\S]{0,300}?name="kcfg_${key}"`
            ),
            `${key} has no label in the form`
        );
    }
});

test("every entry carries a label and a tooltip for the generated fallback", () => {
    // If config.ui ever fails to load, the KCM falls back to generating a form
    // from main.xml alone. Without labels that fallback shows bare key names.
    const blocks = xml.split("<entry ").slice(1);
    for (const b of blocks) {
        const name = (b.match(/name="(\w+)"/) || [])[1];
        assert.match(b, /<label>/, `${name} has no <label>`);
        assert.match(b, /<tooltip>/, `${name} has no <tooltip>`);
    }
});

test("no stray double hyphen inside an XML comment", () => {
    // '--' is illegal inside an XML comment and silently breaks the whole file.
    for (const m of ui.matchAll(/<!--([\s\S]*?)-->/g)) {
        assert.ok(!m[1].includes("--"), "comment contains '--': " + m[1].slice(0, 60));
    }
});
