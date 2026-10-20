/**
 * An element's text with every run of whitespace collapsed to one space. Svelte
 * keeps template whitespace (line breaks, indentation) inside text nodes, so
 * assertions on rendered prose compare against this rather than raw textContent.
 */
export function normalizedText(el: Element | null | undefined): string {
	return (el?.textContent ?? '').replace(/\s+/g, ' ');
}

/** The trimmed text of every `selector` heading under `root`, in document order. */
export function headingTexts(root: ParentNode, selector = 'h2'): string[] {
	return [...root.querySelectorAll(selector)].map((h) => h.textContent?.trim() ?? '');
}

/** The normalized text of the `<section>` whose h2 reads `heading` ('' if none). */
export function sectionText(root: ParentNode, heading: string): string {
	const h2 = [...root.querySelectorAll('h2')].find((h) => h.textContent?.trim() === heading);
	return normalizedText(h2?.closest('section'));
}
