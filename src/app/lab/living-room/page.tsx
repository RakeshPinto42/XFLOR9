import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Living room (3D test scene)",
  description: "XPLOR9's 3D foundation test scene: a 1990s Indian living room on a rainy evening.",
  robots: { index: false, follow: false },
};

/**
 * Test scene for the shared 3D foundation (F1). The scene itself is drawn by the site-wide
 * stage (src/stage), which picks it from the page address; this page is ordinary content on top.
 */
export default function LivingRoomLabPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="max-w-md rounded-2xl bg-ink/75 p-5 text-panel shadow-lg backdrop-blur">
        <h1 className="font-display text-3xl leading-tight">1990s living room</h1>
        <p className="mt-2 text-sm text-panel/90">
          A rainy evening at home: the TV in its wooden cabinet, the ceiling fan turning, rain against the window grill. This is
          XPLOR9&apos;s test scene for the shared 3D foundation.
        </p>
      </div>
    </section>
  );
}
