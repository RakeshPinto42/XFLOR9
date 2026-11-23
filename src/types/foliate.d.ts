/** Minimal types for the parts of foliate-js (MIT, untyped JavaScript) that XPLOR9 uses. */
declare module "foliate-js/view.js" {
  export interface FoliateTocItem {
    label: string;
    href: string;
    subitems?: FoliateTocItem[] | null;
  }
  export interface FoliateBook {
    toc?: FoliateTocItem[];
    sections: unknown[];
    metadata?: { title?: unknown; language?: unknown };
    transformTarget?: EventTarget;
    destroy?: () => void;
  }
  export function makeBook(file: File | Blob | string): Promise<FoliateBook>;
}

declare module "foliate-js/epub.js" {
  import type { FoliateBook } from "foliate-js/view.js";
  /** foliate's EPUB parser. The loader supplies already-extracted files (no unzip here). */
  export class EPUB {
    constructor(loader: {
      loadText: (name: string) => Promise<string | null> | string | null;
      loadBlob: (name: string, type?: string) => Promise<Blob | null> | Blob | null;
      getSize: (name: string) => number;
    });
    init(): Promise<FoliateBook>;
  }
}

declare module "foliate-js/epubcfi.js" {
  /** Reduce a range CFI to its start (or end) point. */
  export function collapse(cfi: string, toEnd?: boolean): string;
  /** Negative if a is before b, 0 if equal, positive if after. */
  export function compare(a: string, b: string): number;
}
