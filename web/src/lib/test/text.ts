/**
 * An element's text with every run of whitespace collapsed to one space. Svelte
 * keeps template whitespace (line breaks, indentation) inside text nodes, so
 * assertions on rendered prose compare against this rather than raw textContent.
 */
export function normalizedText(el: Element | null | undefined): string {
	return (el?.textContent ?? '').replace(/\s+/g, ' ');
}
