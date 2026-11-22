import { strFromU8, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { stripCover, unzipEpub, zipEpub } from "./prepare-epub";

/** A tiny EPUB shaped like Project Gutenberg's output. */
function sampleEpub() {
  return new Map<string, Uint8Array>([
    ["mimetype", strToU8("application/epub+zip")],
    ["META-INF/container.xml", strToU8('<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>')],
    [
      "OEBPS/content.opf",
      strToU8(`<package><metadata>
    <dc:title>T</dc:title>
    <meta name="cover" content="img1"/>
  </metadata><manifest>
    <!--Image: 650 x 1000-->
    <item href="c_cover.jpg" id="img1" media-type="image/jpeg"/>
    <item href="ch1.html" id="item1" media-type="application/xhtml+xml"/>
    <item href="wrap0000.html" id="coverpage-wrapper" media-type="application/xhtml+xml"/>
  </manifest><spine>
    <itemref idref="coverpage-wrapper" linear="yes"/>
    <itemref idref="item1" linear="yes"/>
  </spine><guide>
    <reference type="cover" title="Cover" href="wrap0000.html"/>
  </guide></package>`),
    ],
    ["OEBPS/c_cover.jpg", new Uint8Array([1, 2, 3])],
    ["OEBPS/wrap0000.html", strToU8('<html><img src="c_cover.jpg"/></html>')],
    [
      "OEBPS/ch1.html",
      strToU8('<html><head>\n<link href="c_cover.jpg" rel="icon" type="image/x-cover" id="img1"/>\n</head><body>\nChapter text.\n</body></html>'),
    ],
  ]);
}

describe("stripCover", () => {
  it("removes the cover image, cover page and every reference, leaving the text", () => {
    const files = sampleEpub();
    const report = stripCover(files);
    expect(report.removedFiles.sort()).toEqual(["OEBPS/c_cover.jpg", "OEBPS/wrap0000.html"]);
    expect(report.remainingImages).toEqual([]);
    const opf = strFromU8(files.get("OEBPS/content.opf")!);
    expect(opf).not.toMatch(/cover|wrap0000|Image:/);
    expect(opf).toContain('idref="item1"');
    const ch = strFromU8(files.get("OEBPS/ch1.html")!);
    expect(ch).not.toContain("c_cover.jpg");
    expect(ch).toContain("Chapter text.");
  });

  it("refuses to guess when there is no declared cover", () => {
    const files = sampleEpub();
    files.set("OEBPS/content.opf", strToU8("<package><manifest/><spine/></package>"));
    expect(() => stripCover(files)).toThrow(/No cover found/);
  });

  it("writes mimetype first and stored, and the result reopens", () => {
    const files = sampleEpub();
    stripCover(files);
    const zipped = zipEpub(files);
    expect(strFromU8(zipped.subarray(30, 38))).toBe("mimetype");
    expect(zipped[8]).toBe(0); // compression method 0 = stored
    expect([...unzipEpub(zipped).keys()]).toContain("OEBPS/ch1.html");
  });

  it("is reproducible: the same input gives identical bytes", () => {
    const a = sampleEpub();
    const b = sampleEpub();
    stripCover(a);
    stripCover(b);
    expect(zipEpub(a)).toEqual(zipEpub(b));
  });
});
