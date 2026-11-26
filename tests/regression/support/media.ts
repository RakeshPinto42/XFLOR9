import type { Page } from "@playwright/test";

/**
 * Whether this browser can actually play audio. Playwright's WebKit build on Windows can't play
 * any media (play() rejects with NotSupportedError), so tests that need real sound skip there
 * and say why; everything else in them still runs. Real Safari (macOS, iOS) plays audio.
 */
export async function canPlayAudio(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const rate = 8000;
    const n = 800;
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, "RIFF");
    v.setUint32(4, 36 + n * 2, true);
    w(8, "WAVEfmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    w(36, "data");
    v.setUint32(40, n * 2, true);
    const a = new Audio(URL.createObjectURL(new Blob([buf], { type: "audio/wav" })));
    a.muted = true;
    return a.play().then(
      () => (a.pause(), true),
      () => false,
    );
  });
}
