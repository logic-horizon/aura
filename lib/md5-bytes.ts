/** Returns the hex MD5 digest of the bytes, or of the UTF-8 encoding of a string. */
export function md5Bytes(bytes: Uint8Array | string): string {
  const hasher = new Bun.CryptoHasher("md5");
  
  hasher.update(
    typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes,
  );

  return hasher.digest("hex");
}
