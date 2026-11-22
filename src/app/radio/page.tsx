import type { Metadata } from "next";
import { RadioExperience } from "@/features/radio/RadioExperience";

export const metadata: Metadata = { title: "Radio" };

export default function RadioPage() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6 md:py-14">
      <div className="mb-8">
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">Radio</h1>
        <p className="mt-2 max-w-prose text-lg text-ink-soft">
          Live stations from India and around the world. Keep listening while you explore the rest of XPLOR9.
        </p>
      </div>
      <RadioExperience />
    </section>
  );
}
