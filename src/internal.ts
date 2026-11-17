import type { App, Command, Workspace } from 'obsidian';
import type { StateHistory } from '@obsidian-typings/obsidian-public-latest';

// Types for Obsidian's internal APIs come from obsidian-typings (importing it above enables them). They're
// unofficial, so everything is still checked at runtime: the plugin does nothing if something is missing, so a future
// Obsidian update can make it stop working but shouldn't make it break anything.

/** Where a tab was in its tab group just before it was closed. */
export interface ClosedTabPosition {
	parentId: string;
	index: number;
	prevId: string | null;
	nextId: string | null;
}

/** An entry in workspace.undoHistory, the list of closed tabs used by "Undo close tab" (most recent first). */
export type UndoHistoryEntry = StateHistory & {
	/** Set by Obsidian, but missing from obsidian-typings */
	leafId?: string;
	/** Added by this plugin */
	reopenTabInPlacePosition?: ClosedTabPosition;
};

export type CheckCallbackCommand = Command & {
	checkCallback(checking: boolean): boolean | void;
};

export function undoHistoryEntry(entry: StateHistory | undefined): UndoHistoryEntry | undefined {
	return entry;
}

/** Whether the internal undo history this plugin relies on exists. */
export function hasUndoHistory(workspace: Workspace): boolean {
	const ws: Partial<Workspace> = workspace;
	return typeof ws.pushUndoHistory === 'function' && Array.isArray(ws.undoHistory);
}

export function getCommand(app: App, id: string): CheckCallbackCommand | null {
	const command = app.commands?.commands?.[id];
	if (typeof command?.checkCallback !== 'function') return null;
	return command as CheckCallbackCommand;
}
