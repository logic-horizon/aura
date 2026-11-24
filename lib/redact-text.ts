const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Replaces email addresses and phone numbers with placeholders, and drops any line that looks
 * like a street address. A phone-shaped run that is exactly an ISO date (`YYYY-MM-DD`) is kept.
 */
export function redactText(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted email]")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, (match) =>
      ISO_DATE.test(match) ? match : "[redacted phone]",
    )
    .split(/\r?\n/)
    .filter(
      (line) =>
        !/\b\d{1,6}\s+\S+\s+(?:street|st\.|road|rd\.|avenue|ave\.|lane|ln\.|boulevard|blvd\.)\b/i.test(
          line,
        ),
    )
    .join("\n");
}
