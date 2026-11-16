# Reopen Tab In Place

Usually when you close a tab in Obsidian and then reopen it by undoing, Obsidian reopens it at the far right of the tab bar.
With this plugin, it's reopened in its previous location instead, like in browsers and editors such as VS Code.

## Usage

Close a tab (default: <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>W</kbd>), and then run the **Undo close tab** command
(default: <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd>). The tab will reopen in its previous location in the tab bar.

## How it works

Obsidian has no public API for this, so the plugin relies on a few internal parts of Obsidian: the list of recently closed tabs and the "Undo close tab" command. It checks that they exist and does nothing if they don't, so a future Obsidian update could make it stop working, but shouldn't break anything.

## Compatibility with other plugins

Let me know if it interferes with other plugins by opening an issue!
