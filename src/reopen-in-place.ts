import { Plugin, WorkspaceItem, WorkspaceLeaf, WorkspaceParent, WorkspaceTabs } from 'obsidian';
import { ClosedTabPosition, getCommand, hasUndoHistory, undoHistoryEntry } from './internal';
import { patchMethod } from './patch';
import { isInsideTabGroup, tabGroupOf } from './tab-groups-compat';

const UNDO_CLOSE_TAB_COMMAND = 'workspace:undo-close-pane';
const LOG_PREFIX = '[Reopen Tab In Place]';

/**
 * Obsidian's "Undo close tab" (workspace:undo-close-pane) reopens a closed tab at the end of its old tab group, and
 * other plugins may move it too (e.g. Open Tab Settings moves it according to "New tab placement"). This puts it back
 * where it was closed:
 *
 * 1. Right before a leaf is detached, record its position in its tab group (index and ids of its neighbouring tabs).
 * 2. Attach that position to the entry Obsidian pushes onto workspace.undoHistory. (pushUndoHistory runs after the
 *    leaf has already been removed from its parent, hence step 1.)
 * 3. Wrap the undo command. Once the command, and any other plugin's wrapper around it, has finished, move the
 *    reopened leaf back to its recorded position. This runs in a microtask, so it always gets the last word but still
 *    happens before the next repaint, so there's no visible jump.
 *
 * Everything else (view state, history, pinned state, focus) is still handled by Obsidian.
 */
export function registerReopenInPlace(plugin: Plugin): void {
	const workspace = plugin.app.workspace;
	if (!hasUndoHistory(workspace)) {
		console.warn(LOG_PREFIX, 'Obsidian undo history not found, plugin inactive');
		return;
	}

	// Positions of leaves currently being detached, read in pushUndoHistory
	const closingPositions = new WeakMap<WorkspaceLeaf, ClosedTabPosition>();

	patchMethod(plugin, WorkspaceLeaf.prototype, 'detach', (original) => function (this: WorkspaceLeaf) {
		const position = getTabPosition(this);
		if (position) closingPositions.set(this, position);
		try {
			original.call(this);
		} finally {
			closingPositions.delete(this);
		}
	});

	patchMethod(plugin, workspace, 'pushUndoHistory', (original) => function (this: typeof workspace, leaf, ...args) {
		const before = this.undoHistory[0];
		original.call(this, leaf, ...args);
		const entry = undoHistoryEntry(this.undoHistory[0]);
		const position = closingPositions.get(leaf);
		if (entry && entry !== before && position && entry.leafId === leaf.id) {
			entry.reopenTabInPlacePosition = position;
		}
	});

	plugin.app.workspace.onLayoutReady(() => {
		const command = getCommand(plugin.app, UNDO_CLOSE_TAB_COMMAND);
		if (!command) {
			console.warn(LOG_PREFIX, `Command ${UNDO_CLOSE_TAB_COMMAND} not found, plugin inactive`);
			return;
		}
		patchMethod(plugin, command, 'checkCallback', (original) => function (this: unknown, checking: boolean) {
			if (checking) return original.call(this, checking);
			const entry = undoHistoryEntry(workspace.undoHistory[0]);
			const result = original.call(this, checking);
			const position = entry?.reopenTabInPlacePosition;
			const leafId = entry?.leafId;
			if (position && leafId) {
				// Defer until every wrapper around the command has returned
				queueMicrotask(() => restorePosition(plugin, leafId, position));
			}
			return result;
		});
	});
}

function getTabPosition(leaf: WorkspaceLeaf): ClosedTabPosition | null {
	// parent is typed as always set, but is null for leaves that aren't attached
	const group: WorkspaceParent | null = leaf.parent;
	if (!group || !Array.isArray(group.children)) return null;
	const siblings = group.children;
	const index = siblings.indexOf(leaf);
	if (index === -1) return null;
	const prev = siblings[index - 1];
	const next = siblings[index + 1];
	return {
		parentId: group.id,
		index,
		prevId: prev ? prev.id : null,
		nextId: next ? next.id : null,
	};
}

/** Move the reopened leaf back to where it was when it was closed. */
function restorePosition(plugin: Plugin, leafId: string, position: ClosedTabPosition): void {
	const leaf = plugin.app.workspace.getLeafById(leafId);
	if (!leaf) return;

	// parent is typed as always set, but is null for leaves that aren't attached
	const group: WorkspaceParent | null = leaf.parent;
	// Only if it was reopened into its old tab group (Obsidian falls back to another location if that group is gone)
	if (!group || group.id !== position.parentId || !Array.isArray(group.children)) return;
	// Removing the only tab would remove the tab group itself
	if (group.children.length < 2) return;
	// The Tab Groups plugin puts tabs back into their group itself (see tab-groups-compat.ts)
	if (tabGroupOf(leaf)) return;

	const from = group.children.indexOf(leaf);
	const others = group.children.filter((c) => c !== leaf);
	const target = resolveIndex(others, position);
	if (target === from || isInsideTabGroup(others, target)) return;

	// removeChild/insertChild don't keep currentTab pointing at the same tab, so reselect it afterwards
	const tabs = group instanceof WorkspaceTabs ? group : null;
	const selected = tabs?.children[tabs.currentTab];
	group.removeChild(leaf);
	group.insertChild(target, leaf);
	const selectedIndex = selected ? group.children.indexOf(selected) : -1;
	if (tabs && selectedIndex !== -1) tabs.selectTabIndex(selectedIndex);
}

/**
 * Index to insert the tab at among the other tabs: right after its old left neighbour, else right before its old right
 * neighbour, else its old index.
 */
function resolveIndex(others: WorkspaceItem[], position: ClosedTabPosition): number {
	if (position.prevId) {
		const i = others.findIndex((c) => c.id === position.prevId);
		if (i !== -1) return i + 1;
	}
	if (position.nextId) {
		const i = others.findIndex((c) => c.id === position.nextId);
		if (i !== -1) return i;
	}
	return Math.min(position.index, others.length);
}
