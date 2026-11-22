import Link from "next/link";
import { STATUS_LABEL, getModule, type ModuleId } from "@/lib/modules";
import { ModuleDevice } from "./ModuleDevice";

/** Honest placeholder for modules that are not built yet: says what is coming, nothing fake. */
export function ComingSoon({ id }: { id: ModuleId }) {
  const m = getModule(id);
  return (
    <section className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1fr_1.1fr] md:items-center md:py-20">
      <div className="crt-screen grid aspect-[4/3] place-items-center p-6 text-center">
        <div className="static-noise absolute inset-0 opacity-15" aria-hidden />
        <div className="relative">
          <p className="font-pixel text-sm text-phosphor/80">No signal yet</p>
          <p className="logo-mark logo-mark--on-screen mt-2 text-5xl sm:text-6xl">{m.name}</p>
        </div>
      </div>

      <div>
        <div className="mb-6 flex h-36 items-end">
          <ModuleDevice id={id} />
        </div>
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">{m.name}</h1>
        <p className="mt-3 max-w-prose text-lg text-ink-soft">{m.tagline}</p>
        <p className="status-sticker mt-4" data-status={m.status}>
          {STATUS_LABEL[m.status]}
        </p>
        <h2 className="mt-8 text-lg font-bold">What you&apos;ll be able to do</h2>
        <ul className="mt-3 max-w-prose list-disc space-y-1.5 pl-5 text-ink-soft">
          {m.plans.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <Link href="/" className="mt-8 inline-block font-semibold underline underline-offset-4">
          Back to the shelf
        </Link>
      </div>
    </section>
  );
}
