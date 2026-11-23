import type { Metadata } from "next";
import { Hanken_Grotesk, Shrikhand, Silkscreen } from "next/font/google";
import { MiniPlayer } from "@/components/MiniPlayer";
import { SiteHeader } from "@/components/SiteHeader";
import { STORAGE_KEYS } from "@/lib/storage/local";
import { StageRoot } from "@/stage/StageRoot";
import "./globals.css";

// next/font self-hosts these at build time: no runtime requests to Google.
const shrikhand = Shrikhand({ weight: "400", subsets: ["latin"], variable: "--font-shrikhand" });
const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken" });
const silkscreen = Silkscreen({ weight: "400", subsets: ["latin"], variable: "--font-silkscreen" });

export const metadata: Metadata = {
  title: { default: "XPLOR9: Your childhood. Reconnected.", template: "%s | XPLOR9" },
  description:
    "Radio, TV, music, games and a reading room inspired by Indian 90s and 2000s entertainment.",
};

// Runs before first paint so returning visitors never see a flash of the intro.
const introSeenScript = `try{if(localStorage.getItem(${JSON.stringify(
  STORAGE_KEYS.introSeen,
)})==="true")document.documentElement.dataset.introSeen="true"}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${shrikhand.variable} ${hanken.variable} ${silkscreen.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: introSeenScript }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        {/* The one shared 3D stage: renders nothing on pages without a scene. */}
        <StageRoot />
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <footer className="border-t-2 border-ink/15">
          <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-ink-soft sm:px-6">
            Everything XPLOR9 remembers, like favourites and progress, stays in this browser.
          </div>
        </footer>
        <MiniPlayer />
      </body>
    </html>
  );
}
