// Entry point. Kept stable across versions; the implementation lives in
// Borders.qml next to it. (HyprKwin routes through a Loader + build folder
// because KWin caches QML by path; v1 of this script keeps it simple and
// documents the logout caveat in the README instead.)
import QtQuick
import org.kde.kwin as KWin

Item {
    Borders {
        id: root
    }
}
