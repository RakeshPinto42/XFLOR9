import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Monsoon neighbourhood (3D)",
  description: "XPLOR9's first environment: a small Indian neighbourhood on a monsoon evening.",
  robots: { index: false, follow: false },
};

/**
 * The first major XPLOR9 environment (U1 benchmark, F1 increment 3). Drawn by the site-wide
 * stage (src/stage), which picks the scene from this page's address.
 */
export default function MonsoonLabPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="max-w-md rounded-2xl bg-ink/70 p-5 text-panel shadow-lg backdrop-blur">
        <h1 className="font-display text-3xl leading-tight">Monsoon evening</h1>
        <p className="mt-2 text-sm text-panel/90">
          Rain on the tiled roofs, puddles in the lane, lamps coming on in the verandas. XPLOR9&apos;s first neighbourhood, still
          being built.
        </p>
      </div>
    </section>
  );
}
