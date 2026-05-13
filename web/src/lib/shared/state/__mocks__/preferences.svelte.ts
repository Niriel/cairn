import type { FontSize, Theme } from '../preferences.svelte';

export type { FontSize, Theme };

export const preferences: { theme: Theme; fontSize: FontSize } = {
	theme: 'system',
	fontSize: 'm'
};
