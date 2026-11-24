import { expect, test } from "bun:test";
import { buildProfile } from "@/lib/enrich/build-profile";
import type { ModelProvider } from "@/lib/models/provider";
import { emptyProfile } from "@/vector/store";

/** A provider whose structured reply has the given identity name. No API is called. */
function providerReturningName(name: string): ModelProvider {
  const profile = emptyProfile();
  profile.identity.name = name;
  return { completeStructured: async () => profile } as unknown as ModelProvider;
}

/** Builds version 1 from one snippet, with the stub reply, and returns its identity name. */
async function nameFrom(reply: string): Promise<string | undefined> {
  const profile = await buildProfile("unused", providerReturningName(reply), ["snippet"], null, false);
  return profile?.identity.name;
}

test("keeps the given first name and the family initial", async () => {
  expect(await nameFrom("Sifat S. Sifat S.")).toBe("Sifat S.");
});

test("reduces a full name to the first name and family initial", async () => {
  expect(await nameFrom("Alex Kim")).toBe("Alex K.");
});

test("strips stray quotes and punctuation from the name", async () => {
  expect(await nameFrom('Sifat", ')).toBe("Sifat");
});

test("keeps a public handle", async () => {
  expect(await nameFrom("@sifat_dev")).toBe("@sifat_dev");
});

test("leaves an empty name empty", async () => {
  expect(await nameFrom("")).toBe("");
});
