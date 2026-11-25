import type { Metadata } from "next";
import { GamesHub } from "@/features/games/GamesHub";

export const metadata: Metadata = {
  title: "Games",
  description: "Original takes on classic arcade and puzzle games, playable in the browser.",
};

export default function GamesPage() {
  return <GamesHub />;
}
