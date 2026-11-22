import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Music" };

export default function MusicPage() {
  return <ComingSoon id="music" />;
}
