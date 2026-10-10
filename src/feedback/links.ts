// Every web page Wavescan can open in the user's browser. Rust only lets the app open URLs
// under these prefixes (the opener scope in src-tauri/capabilities/default.json, ADR 0028),
// so keep the two lists in step. Opening a page is the browser's connection, not the app's:
// Wavescan itself sends nothing.

export const REPO_URL = "https://github.com/wavescan/wavescan";
export const FAIR_PLAY_URL = "https://wutheringwaves.kurogames.com/en/main/news/detail/742";

/** The URL prefixes the app may open (mirrors the capability scope). */
export const ALLOWED_URL_PREFIXES = [`${REPO_URL}/`, FAIR_PLAY_URL] as const;

/** True if `url` is one the app is allowed to open. */
export function isAllowedUrl(url: string): boolean {
  return ALLOWED_URL_PREFIXES.some((prefix) => url === prefix || url.startsWith(prefix));
}

/** The source code this copy was built from: the build's commit, or `main` for local builds. */
export function sourceUrl(build: string | null): string {
  return build && /^[0-9a-f]{7,40}$/.test(build) ? `${REPO_URL}/tree/${build}` : `${REPO_URL}/tree/main`;
}

export const RELEASES_URL = `${REPO_URL}/releases`;
export const SECURITY_URL = `${REPO_URL}/security/policy`;
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;
export const ISSUES_URL = `${REPO_URL}/issues`;

/** Searches existing issues for `query` (so people can add to one instead of opening a duplicate). */
export function issueSearchUrl(query: string): string {
  const q = `is:issue ${query}`.trim();
  return `${ISSUES_URL}?q=${encodeURIComponent(q)}`;
}
