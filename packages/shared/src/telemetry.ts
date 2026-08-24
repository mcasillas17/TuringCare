// React Router decodes each path segment once before case-insensitive matching.
// For the one-character `b` segment, the only encoded equivalents are `%62`
// and `%42`. Match those exact forms without decoding any unrelated input.
const publicBriefTelemetryPath = /^\/(?:b|%62|%42)\/[^/?#]+\/*(?:[?#].*)?$/i;

/**
 * Replaces the bearer segment of the public Brief route before a path reaches
 * telemetry. Query and hash suffixes are discarded with the segment; browser
 * pathnames normally omit them, but server-side callers are untrusted.
 */
export function normalizeTelemetryPagePath(path: string): string {
  return publicBriefTelemetryPath.test(path) ? "/b/:token" : path;
}
