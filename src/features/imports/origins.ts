/**
 * The two origins involved in imported-file reading:
 *   main origin   – XPLOR9 itself, which owns all user data (IndexedDB, localStorage)
 *   reader origin – a separate origin that renders imported files and holds no user data
 *
 * Production: both must be configured (NEXT_PUBLIC_XPLOR9_ORIGIN, NEXT_PUBLIC_XPLOR9_READER_ORIGIN),
 * otherwise imports are disabled (fail closed).
 * Local development only: http://localhost:<port> pairs with http://127.0.0.1:<port>.
 * Browsers treat those as different origins even though it's the same server.
 */

interface Loc {
  protocol: string;
  hostname: string;
  port: string;
}

const MAIN = process.env.NEXT_PUBLIC_XPLOR9_ORIGIN || null;
const READER = process.env.NEXT_PUBLIC_XPLOR9_READER_ORIGIN || null;

const withPort = (l: Loc, host: string) => `${l.protocol}//${host}${l.port ? `:${l.port}` : ""}`;

/** Where the isolated reader lives, as seen from the main app. Null = imports disabled. */
export function readerOriginFor(loc: Loc, configured: string | null = READER, main: string | null = MAIN): string | null {
  if (configured) return configured !== (main ?? withPort(loc, loc.hostname)) ? configured : null;
  if (loc.hostname === "localhost") return withPort(loc, "127.0.0.1");
  return null;
}

/** Which origin may embed and talk to the isolated reader, as seen from the reader. Null = refuse. */
export function mainOriginFor(loc: Loc, configured: string | null = MAIN, reader: string | null = READER): string | null {
  const here = withPort(loc, loc.hostname);
  if (configured) return reader && here === reader && configured !== reader ? configured : null;
  if (loc.hostname === "127.0.0.1") return withPort(loc, "localhost");
  return null;
}
