import { extractText, getDocumentProxy } from "unpdf";
import { EXTRACT_TEXT_CAP } from "@/lib/sanitize";

/**
 * Extracts the text of a PDF with unpdf, joining pages with newlines. Throws when the text
 * exceeds `EXTRACT_TEXT_CAP` or is more than 5 characters per input byte.
 */
export async function extractPdf(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const extracted = await extractText(pdf, { mergePages: true });
  const text = Array.isArray(extracted.text)
    ? extracted.text.join("\n")
    : String(extracted.text ?? "");
  if (text.length > EXTRACT_TEXT_CAP || text.length > bytes.length * 5) {
    throw new Error("PDF extract exceeded size cap");
  }
  return text;
}
