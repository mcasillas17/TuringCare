const publicBriefTelemetryPath = /^\/b\/[^/?#]+\/*(?:[?#].*)?$/i;

/**
 * Replaces the bearer segment of the public Brief route before a path reaches
 * telemetry. Query and hash suffixes are discarded with the segment; browser
 * pathnames normally omit them, but server-side callers are untrusted.
 */
export function normalizeTelemetryPagePath(path: string): string {
  return publicBriefTelemetryPath.test(path) ? "/b/:token" : path;
}
