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
