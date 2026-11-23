import { execFileSync } from "node:child_process";

/** Generates the malicious/malformed EPUB and PDF corpora (git-ignored) before the suite runs. */
export default function globalSetup() {
  for (const script of ["scripts/books/make-security-fixtures.ts", "scripts/books/make-pdf-security-fixtures.ts"]) {
    execFileSync(process.execPath, ["--max-old-space-size=4096", script], { stdio: "ignore" });
  }
}
