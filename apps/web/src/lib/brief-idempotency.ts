type BrowserSecureRandom = {
  randomUUID?: () => string;
  getRandomValues: <T extends ArrayBufferView>(array: T) => T;
};

/** Create a cryptographically suitable UUID without ever falling back to Math.random. */
export function createBriefSendIdempotencyKey(
  secureRandom: BrowserSecureRandom | null | undefined = globalThis.crypto,
): string {
  if (!secureRandom) throw new Error("secure_random_unavailable");
  if (secureRandom.randomUUID) return secureRandom.randomUUID();

  const bytes = secureRandom.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
