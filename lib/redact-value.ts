import { redactText } from "@/lib/redact-text";

/**
 * Applies `redactText` to every string inside a value, recursing through arrays and objects.
 * Other values are returned unchanged.
 */
export function redactValue<T>(value: T): T {
  if (typeof value === "string") return redactText(value) as T;
  if (Array.isArray(value)) return value.map((item) => redactValue(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactValue(item)]),
    ) as T;
  }
  return value;
}
