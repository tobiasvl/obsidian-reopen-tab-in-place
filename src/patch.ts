import type { Plugin } from 'obsidian';

type AnyFunction = (this: unknown, ...args: unknown[]) => unknown;

/**
 * Wrap the method obj[key] with wrapper(original) until the plugin unloads.
 *
 * On unload, the original is restored if our wrapper is still the outermost one. If another plugin has wrapped the
 * method since, our wrapper stays in place but becomes a passthrough, so we don't remove the other plugin's wrapper
 * along with ours (the same approach as the monkey-around library).
 */
export function patchMethod<O extends object, K extends keyof O>(
	plugin: Plugin,
	obj: O,
	key: K,
	wrapper: (original: O[K]) => O[K],
): void {
	const hadOwn = Object.prototype.hasOwnProperty.call(obj, key);
	const original = obj[key];
	const wrapped = wrapper(original) as unknown as AnyFunction;
	let active = true;
	const installed = function (this: unknown, ...args: unknown[]) {
		return (active ? wrapped : (original as unknown as AnyFunction)).apply(this, args);
	};
	obj[key] = installed as unknown as O[K];

	plugin.register(() => {
		active = false;
		if (obj[key] !== (installed as unknown)) return;
		if (hadOwn) obj[key] = original;
		else Reflect.deleteProperty(obj, key);
	});
}
