import Link from "next/link";
import "./reading.css";

/**
 * The Reading Room usually opens inside its desktop window (a frame). Opened on its own
 * (a shared link, a new tab), it gets a slim bar back to the desktop; inside the window that
 * bar is hidden (see the `embedded` flag set in the root layout).
 */
export default function ReadingLayout({ children }: LayoutProps<"/reading">) {
  return (
    <div className="reading-site flex min-h-dvh flex-col">
      <header className="standalone-only border-b border-ink/15 bg-panel">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 sm:px-6">
          <Link href="/" className="logo-mark text-3xl leading-none" aria-label="XPLOR9 desktop">
            XPLOR9
          </Link>
          <Link href="/reading" className="font-semibold hover:underline">
            Reading Room
          </Link>
          <Link href="/" className="ml-auto text-sm font-semibold hover:underline">
            Open the desktop
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
