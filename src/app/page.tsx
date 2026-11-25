import { CrtIntro } from "@/components/CrtIntro";
import { StreetDirectory } from "@/features/home/StreetDirectory";

/**
 * The homepage is Monsoon Lane (the 3D street is drawn by the shared stage, see
 * src/scenes/home/HomeStreet.tsx). The page itself only carries the ways in.
 */
export default function Home() {
  return (
    <>
      <CrtIntro />
      <StreetDirectory />
    </>
  );
}
