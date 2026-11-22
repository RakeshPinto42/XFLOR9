import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Reading Room" };

export default function ReadingPage() {
  return <ComingSoon id="reading" />;
}
