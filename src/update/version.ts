// Version numbers for app updates (ADR 0035). Releases are plain semver ("0.2.0"); tester
// builds add a build number ("0.2.1-tester.57"), which semver orders before the release
// of the same number. Only the parts Wavescan's own versions use are supported.

/** Which builds a copy updates from: tagged releases, or every merge to main. */
export type UpdateChannel = "stable" | "tester";

interface Parsed {
  core: [number, number, number];
  pre: (number | string)[];
}

function parse(version: string): Parsed | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version.trim());
  if (!match) return null;
  const pre = match[4] ? match[4].split(".").map((part) => (/^\d+$/.test(part) ? Number(part) : part)) : [];
  return { core: [Number(match[1]), Number(match[2]), Number(match[3])], pre };
}

/** True for a version string Wavescan can compare. */
export function isVersion(version: string): boolean {
  return parse(version) !== null;
}

/**
 * Compares two versions by semver precedence: negative when `a` is older, 0 when equal,
 * positive when newer. A version that can't be read counts as older than any other.
 */
export function compareVersions(a: string, b: string): number {
  const [x, y] = [parse(a), parse(b)];
  if (!x || !y) return (x ? 1 : 0) - (y ? 1 : 0);
  for (const i of [0, 1, 2] as const) {
    if (x.core[i] !== y.core[i]) return x.core[i] - y.core[i];
  }
  // A release is newer than any pre-release of the same number.
  if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const [p, q] = [x.pre[i], y.pre[i]];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    if (typeof p === "number" && typeof q === "number") return p - q;
    if (typeof p === "number") return -1; // numbers sort before words
    if (typeof q === "number") return 1;
    return p < q ? -1 : 1;
  }
  return 0;
}

/** The channel a version belongs to: tester builds are "-tester.N". */
export function channelOf(version: string): UpdateChannel {
  return parse(version)?.pre[0] === "tester" ? "tester" : "stable";
}
