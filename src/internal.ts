import type { App, Workspace, WorkspaceLeaf } from 'obsidian';

// Undocumented Obsidian internals this plugin relies on. They are checked at runtime, and the plugin does nothing if
// they are missing, so a future Obsidian update can make it stop working but shouldn't make it break anything.

/** Where a tab was in its tab group just before it was closed. */
export interface ClosedTabPosition {
	parentId: string;
	index: number;
	prevId: string | null;
	nextId: string | null;
}

export interface InternalLeaf {
	id: string;
	parent: InternalTabGroup | null;
}

export interface InternalTabGroup {
	id: string;
	children: WorkspaceLeaf[];
	insertChild(index: number, leaf: WorkspaceLeaf, ...args: unknown[]): void;
}

/** An entry in workspace.undoHistory, the list of closed tabs used by "Undo close tab" (most recent first). */
export interface UndoHistoryEntry {
	leafId?: string;
	/** Added by this plugin */
	reopenTabInPlacePosition?: ClosedTabPosition;
}

export interface InternalWorkspace {
	undoHistory: UndoHistoryEntry[];
	pushUndoHistory(leaf: WorkspaceLeaf, parentId?: string, rootId?: string): void;
}

export interface CheckCallbackCommand {
	checkCallback(checking: boolean): boolean | void;
}

export function internalLeaf(leaf: WorkspaceLeaf): InternalLeaf {
	return leaf as unknown as InternalLeaf;
}

export function getInternalWorkspace(workspace: Workspace): InternalWorkspace | null {
	const ws = workspace as unknown as Partial<InternalWorkspace>;
	if (typeof ws.pushUndoHistory !== 'function' || !Array.isArray(ws.undoHistory)) return null;
	return ws as InternalWorkspace;
}

export function getCommand(app: App, id: string): CheckCallbackCommand | null {
	const commands = (app as unknown as { commands?: { commands?: Record<string, unknown> } }).commands?.commands;
	const command = commands?.[id] as Partial<CheckCallbackCommand> | undefined;
	if (typeof command?.checkCallback !== 'function') return null;
	return command as CheckCallbackCommand;
}
