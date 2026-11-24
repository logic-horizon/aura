import { expect, test } from "bun:test";
import { redactText } from "@/lib/redact-text";

test("keeps an ISO timestamp unchanged", () => {
  expect(redactText("2026-10-11T08:40:29.438Z")).toBe("2026-10-11T08:40:29.438Z");
});

test("still redacts a phone number", () => {
  expect(redactText("call +1 (555) 123-4567 now")).toBe("call [redacted phone] now");
});

test("still redacts an email address", () => {
  expect(redactText("write to jane.doe@example.com")).toBe("write to [redacted email]");
});
