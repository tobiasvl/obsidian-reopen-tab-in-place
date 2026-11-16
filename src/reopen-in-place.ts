import { Plugin, WorkspaceLeaf } from 'obsidian';
import {
	ClosedTabPosition,
	InternalTabGroup,
	getCommand,
	getInternalWorkspace,
	internalLeaf,
} from './internal';
import { patchMethod } from './patch';

const UNDO_CLOSE_TAB_COMMAND = 'workspace:undo-close-pane';
const LOG_PREFIX = '[Reopen Tab In Place]';

/**
 * Obsidian's "Undo close tab" (workspace:undo-close-pane) finds the closed tab's old tab group and reopens the tab
 * with `group.insertChild(group.children.length, leaf)`, i.e. always at the end. This puts it back where it was
 * closed instead:
 *
 * 1. Right before a leaf is detached, record its position in its tab group (index and ids of its neighbouring tabs).
 * 2. Attach that position to the entry Obsidian pushes onto workspace.undoHistory. (pushUndoHistory runs after the
 *    leaf has already been removed from its parent, hence step 1.)
 * 3. While the undo command runs, temporarily intercept insertChild on the tab group the tab is reopened into, so the
 *    tab is inserted at its recorded position instead of at the end.
 *
 * Everything else (view state, history, pinned state, focus) is still handled by Obsidian.
 */
export function registerReopenInPlace(plugin: Plugin): void {
	const workspace = getInternalWorkspace(plugin.app.workspace);
	if (!workspace) {
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
		const entry = this.undoHistory[0];
		const position = closingPositions.get(leaf);
		if (entry && entry !== before && position && entry.leafId === internalLeaf(leaf).id) {
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
			const position = workspace.undoHistory[0]?.reopenTabInPlacePosition;
			const group = position ? findTabGroup(plugin, position.parentId) : null;
			if (!position || !group) return original.call(this, checking);

			const restoreInsertChild = interceptNextInsert(group, () => resolveIndex(group.children, position));
			try {
				return original.call(this, checking);
			} finally {
				restoreInsertChild();
			}
		});
	});
}

function getTabPosition(leaf: WorkspaceLeaf): ClosedTabPosition | null {
	const group = internalLeaf(leaf).parent;
	if (!group || !Array.isArray(group.children)) return null;
	const siblings = group.children;
	const index = siblings.indexOf(leaf);
	if (index === -1) return null;
	const prev = siblings[index - 1];
	const next = siblings[index + 1];
	return {
		parentId: group.id,
		index,
		prevId: prev ? internalLeaf(prev).id : null,
		nextId: next ? internalLeaf(next).id : null,
	};
}

/** Find a tab group by id. */
function findTabGroup(plugin: Plugin, id: string): InternalTabGroup | null {
	const groups: InternalTabGroup[] = [];
	plugin.app.workspace.iterateAllLeaves((leaf) => {
		const group = internalLeaf(leaf).parent;
		if (group?.id === id) groups.push(group);
	});
	return groups[0] ?? null;
}

/**
 * Make the next call to group.insertChild insert at getIndex(index) instead of index. Only affects that one call.
 * Returns a function that removes the interception if it hasn't been used.
 */
function interceptNextInsert(group: InternalTabGroup, getIndex: (index: number) => number): () => void {
	// Usually insertChild comes from the prototype, but restore an own property exactly as it was if there is one
	const ownDescriptor = Object.getOwnPropertyDescriptor(group, 'insertChild');
	const restore = () => {
		if (ownDescriptor) Object.defineProperty(group, 'insertChild', ownDescriptor);
		else Reflect.deleteProperty(group, 'insertChild');
	};
	group.insertChild = function (index: number, leaf: WorkspaceLeaf, ...args: unknown[]) {
		restore();
		group.insertChild(getIndex(index), leaf, ...args);
	};
	return restore;
}

/**
 * Index to insert the tab at among the other tabs: right after its old left neighbour, else right before its old right
 * neighbour, else its old index.
 */
function resolveIndex(others: WorkspaceLeaf[], position: ClosedTabPosition): number {
	if (position.prevId) {
		const i = others.findIndex((c) => internalLeaf(c).id === position.prevId);
		if (i !== -1) return i + 1;
	}
	if (position.nextId) {
		const i = others.findIndex((c) => internalLeaf(c).id === position.nextId);
		if (i !== -1) return i;
	}
	return Math.min(position.index, others.length);
}
