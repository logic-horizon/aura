/**
 * Splits text into paragraph-based snippets of at most 800 characters,
 * dropping fragments shorter than 40 characters.
 */
export function splitSnippets(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length >= 40)
    .flatMap((block) => {
      const parts: string[] = [];
      for (let offset = 0; offset < block.length; offset += 800) {
        const slice = block.slice(offset, offset + 800).trim();
        if (slice.length >= 40) parts.push(slice);
      }
      return parts;
    });
}
