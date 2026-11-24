import type { ZodType } from "zod";

/**
 * The model calls Aura makes: embeddings, plain and schema-validated chat completions,
 * and image description. The OpenRouter implementation is the only one for now.
 */
export type ModelProvider = {

  embed(texts: string[]): Promise<number[][]>;

  complete(system: string, user: string): Promise<string>;

  completeStructured<T>(system: string, user: string, schema: ZodType<T>): Promise<T>;
  
  describeImage(bytes: Uint8Array, mime: string, prompt: string): Promise<string>;
};
