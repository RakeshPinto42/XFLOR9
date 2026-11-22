import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Radio" };

export default function RadioPage() {
  return <ComingSoon id="radio" />;
}
