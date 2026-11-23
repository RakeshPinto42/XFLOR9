/**
 * Reader fonts, self-hosted under public/fonts/reader (SIL Open Font License, see OFL-*.txt there).
 * Injected into each book page (books render in isolated frames, so site fonts don't reach them).
 * unicode-range means a file is only downloaded when a page contains characters from that script,
 * so English books never fetch the Kannada or Devanagari fonts.
 * Generated from the Google Fonts css2 API (variable fonts: one file covers weights 400–700).
 */
export const READER_FONT_FACES = `
@font-face { font-family: "Literata"; font-style: italic; font-weight: 400 700; font-display: swap; src: url("/fonts/reader/literata-latin-ext-400i.woff2") format("woff2"); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF; }
@font-face { font-family: "Literata"; font-style: italic; font-weight: 400 700; font-display: swap; src: url("/fonts/reader/literata-latin-400i.woff2") format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
@font-face { font-family: "Literata"; font-style: normal; font-weight: 400 700; font-display: swap; src: url("/fonts/reader/literata-latin-ext-400.woff2") format("woff2"); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF; }
@font-face { font-family: "Literata"; font-style: normal; font-weight: 400 700; font-display: swap; src: url("/fonts/reader/literata-latin-400.woff2") format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
@font-face { font-family: "Noto Serif Devanagari"; font-style: normal; font-weight: 400 700; font-display: swap; src: url("/fonts/reader/noto-serif-devanagari-devanagari-400.woff2") format("woff2"); unicode-range: U+0900-097F, U+1CD0-1CF4, U+1CF7-1CF9, U+200C-200D, U+20A8, U+20B9, U+20F0, U+25CC, U+A830-A839, U+A8E0-A8FF, U+11B00-11B0A; }
@font-face { font-family: "Noto Serif Kannada"; font-style: normal; font-weight: 400 700; font-display: swap; src: url("/fonts/reader/noto-serif-kannada-kannada-400.woff2") format("woff2"); unicode-range: U+0951-0952, U+0964-0965, U+0B83, U+0C80-0CF3, U+1CD0, U+1CD2-1CD3, U+1CDA, U+1CF2, U+1CF4, U+200C-200D, U+20B9, U+25CC, U+A830-A835; }
`;

/** Literata for Latin; Noto Serif for Indian scripts, with correct OpenType shaping for conjuncts. */
export const READER_FONT_STACK = '"Literata", "Noto Serif Devanagari", "Noto Serif Kannada", Georgia, "Nirmala UI", serif';
