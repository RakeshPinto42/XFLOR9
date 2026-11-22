import Link from "next/link";
import { CrtIntro, ReplayIntroButton } from "@/components/CrtIntro";
import { ModuleDevice } from "@/components/ModuleDevice";
import { MODULES, STATUS_LABEL } from "@/lib/modules";

export default function Home() {
  return (
    <>
      <CrtIntro />

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-12 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pt-16">
        <HeroSet />
        <div>
          <h1 className="font-display text-[2.6rem] leading-[1.08] text-balance sm:text-6xl">
            Switch on. Tune in. Play again.
          </h1>
          <p className="mt-5 max-w-[34rem] text-lg text-ink-soft">
            The radio, TV, cassettes, handheld games and storybooks you grew up with, rebuilt for
            today&apos;s browser. Pick a device from the shelf to begin.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/radio"
              className="rounded-full bg-ink px-6 py-3 font-semibold text-panel hover:bg-ink-soft"
            >
              Tune the radio
            </Link>
            <ReplayIntroButton className="rounded-full border-2 border-ink px-6 py-[0.65rem] font-semibold hover:bg-ink/10" />
          </div>
        </div>
      </section>

      <section aria-labelledby="shelf-heading" className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <h2 id="shelf-heading" className="font-display text-3xl">
          Pick a device
        </h2>
        <ul className="shelf mt-6">
          {MODULES.map((m) => (
            <li key={m.id}>
              <Link href={m.href} className="shelf__item block rounded-lg">
                <div className="shelf__stage">
                  <ModuleDevice id={m.id} />
                </div>
                <h3 className="mt-4 font-display text-2xl">{m.name}</h3>
                <p className="mt-1 text-[0.95rem] leading-snug text-ink-soft">{m.tagline}</p>
                <p className="status-sticker mt-3" data-status={m.status}>
                  {STATUS_LABEL[m.status]}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/** The hero CRT set: beige cabinet, rabbit-ear antenna, channel readout. Static, no looping motion. */
function HeroSet() {
  return (
    <div className="relative mx-auto w-full max-w-[34rem] pt-14" aria-hidden>
      <div className="absolute left-1/2 top-0 h-16 w-1 origin-bottom -translate-x-6 -rotate-[30deg] rounded bg-ink" />
      <div className="absolute left-1/2 top-0 h-16 w-1 origin-bottom translate-x-4 rotate-[26deg] rounded bg-ink" />
      <div className="relative grid grid-cols-[1fr_4.5rem] gap-4 rounded-[2rem] bg-panel p-5 shadow-[0_10px_0_rgb(22_32_74/0.18),inset_0_-6px_0_rgb(22_32_74/0.08)] sm:grid-cols-[1fr_5.5rem]">
        <div className="crt-screen grid aspect-[4/3] place-items-center">
          <div className="text-center">
            <p className="logo-mark logo-mark--on-screen text-6xl sm:text-7xl">XPLOR9</p>
            <p className="mt-2 font-pixel text-xs text-phosphor/75 sm:text-sm">CH 09</p>
          </div>
        </div>
        <div className="flex flex-col items-center gap-4 pt-2">
          <span className="h-12 w-12 rounded-full bg-ink shadow-[inset_0_-4px_0_rgb(0_0_0/0.4)] sm:h-14 sm:w-14" />
          <span className="h-9 w-9 rounded-full bg-brand shadow-[inset_0_-4px_0_rgb(0_0_0/0.25)]" />
          <span className="mt-auto grid w-full gap-1.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className="h-1 rounded bg-ink/30" />
            ))}
          </span>
        </div>
      </div>
      <div className="mx-auto h-4 w-2/3 rounded-b-xl bg-ink/80" />
    </div>
  );
}
