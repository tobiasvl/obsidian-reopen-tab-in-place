import { WorkspaceItem, WorkspaceLeaf } from 'obsidian';

// Compatibility with the Tab Groups plugin (https://github.com/imsang27/obsidian-tab-groups), which groups tabs like
// Chrome does. Tab Groups puts tabs reopened with "Undo close tab" back into their group itself, and it treats any tab
// move it didn't make as the user moving the tab, changing the tab's group to match its new position. So this plugin
// leaves tabs in groups alone, and never moves a tab between two tabs of the same group, which would add it to that
// group.
//
// Tab Groups reacts to tab bar changes with a MutationObserver. Its callback is queued when "Undo close tab" adds the
// reopened tab to the tab bar, before this plugin queues its own microtask, so by the time this plugin runs, Tab Groups
// has already put the reopened tab back in its group (and marked its tab header).

/**
 * The Tab Groups group a tab is in, or null if it's not in a group (or Tab Groups isn't installed). Uses the attribute
 * Tab Groups sets on tab headers, rather than the plugin's internals.
 */
export function tabGroupOf(item: WorkspaceItem | undefined): string | null {
	if (!(item instanceof WorkspaceLeaf)) return null;
	// Typed as always set, but a leaf only has a tab header while it's in a tab bar
	const header: HTMLElement | undefined = item.tabHeaderEl;
	return header?.getAttribute('data-tab-group-id') || null;
}

/** Whether inserting a tab at index among others would put it between two tabs of the same Tab Groups group. */
export function isInsideTabGroup(others: WorkspaceItem[], index: number): boolean {
	const before = tabGroupOf(others[index - 1]);
	return before !== null && before === tabGroupOf(others[index]);
}
