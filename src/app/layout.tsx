import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Shrikhand, Silkscreen } from "next/font/google";
import "./globals.css";

// next/font self-hosts these at build time: no runtime requests to Google.
const shrikhand = Shrikhand({ weight: "400", subsets: ["latin"], variable: "--font-shrikhand" });
const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken" });
const silkscreen = Silkscreen({ weight: "400", subsets: ["latin"], variable: "--font-silkscreen" });

export const metadata: Metadata = {
  title: { default: "XPLOR9: Your childhood. Reconnected.", template: "%s | XPLOR9" },
  description: "A nostalgic personal computer of radio, television, music, video, games and a reading room, from the years 1990 to 2010.",
};

export const viewport: Viewport = { themeColor: "#245edb" };

// Runs before first paint: pages shown inside a desktop window (the Reading Room) drop their own top bar.
const embeddedScript = `try{if(window.self!==window.top)document.documentElement.dataset.embedded="true"}catch(e){document.documentElement.dataset.embedded="true"}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${shrikhand.variable} ${hanken.variable} ${silkscreen.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: embeddedScript }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
