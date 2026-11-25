"use client";

import dynamic from "next/dynamic";
import { memo } from "react";
import type { Cassette } from "@/features/music/catalogue";
import type { TvCatalogue } from "@/features/tv/catalogue";
import type { FeaturedVideo, VideoChannel } from "@/features/video/VideoApp";
import type { AppId } from "./apps";

/** What the server hands the desktop: validated catalogues for the media apps. */
export interface DesktopData {
  tv: { catalogue: TvCatalogue; uploaders: Record<string, string> };
  music: { cassettes: Cassette[]; uploaders: Record<string, string> };
  video: { channels: VideoChannel[]; featured: FeaturedVideo[] };
}

// Each app's code loads the first time its window opens.
const Loading = () => (
  <p className="grid h-full place-items-center bg-[var(--xp-face)] text-[13px]" role="status">
    Starting…
  </p>
);
const RadioExperience = dynamic(() => import("@/features/radio/RadioExperience").then((m) => m.RadioExperience), { loading: Loading });
const TvExperience = dynamic(() => import("@/features/tv/TvExperience").then((m) => m.TvExperience), { loading: Loading });
const MusicExperience = dynamic(() => import("@/features/music/MusicExperience").then((m) => m.MusicExperience), { loading: Loading });
const GamesHub = dynamic(() => import("@/features/games/GamesHub").then((m) => m.GamesHub), { loading: Loading });
const VideoApp = dynamic(() => import("@/features/video/VideoApp").then((m) => m.VideoApp), { loading: Loading });
const ReadingRoomApp = dynamic(() => import("./apps/ReadingRoomApp").then((m) => m.ReadingRoomApp), { loading: Loading });
const Notepad = dynamic(() => import("./apps/Notepad").then((m) => m.Notepad), { loading: Loading });
const ControlPanel = dynamic(() => import("./apps/ControlPanel").then((m) => m.ControlPanel), { loading: Loading });

/** Memoised: moving, focusing or resizing a window never re-renders the app inside it. */
export const AppContent = memo(function AppContent({ id, data }: { id: AppId; data: DesktopData }) {
  switch (id) {
    case "radio":
      return (
        <div className="xp-app-page h-full overflow-auto p-4">
          <RadioExperience />
        </div>
      );
    case "tv":
      return (
        <div className="xp-app-page xp-app-page--dark h-full overflow-auto">
          <TvExperience catalogue={data.tv.catalogue} uploaders={data.tv.uploaders} />
        </div>
      );
    case "music":
      return (
        <div className="xp-app-page xp-app-page--dark h-full overflow-auto">
          <MusicExperience cassettes={data.music.cassettes} uploaders={data.music.uploaders} />
        </div>
      );
    case "games":
      return (
        <div className="xp-app-page h-full overflow-auto">
          <GamesHub />
        </div>
      );
    case "video":
      return <VideoApp channels={data.video.channels} featured={data.video.featured} />;
    case "reading":
      return <ReadingRoomApp />;
    case "notepad":
      return <Notepad />;
    case "control":
      return <ControlPanel />;
  }
});
