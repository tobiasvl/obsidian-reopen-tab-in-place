import { Plugin } from 'obsidian';
import { registerReopenInPlace } from './reopen-in-place';

export default class ReopenTabInPlacePlugin extends Plugin {
	onload() {
		registerReopenInPlace(this);
	}
}
