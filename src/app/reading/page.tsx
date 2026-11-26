import type { Metadata } from "next";
import { BOOKS } from "@/features/reading/books";
import { Bookshelf } from "@/features/reading/Bookshelf";
import { ContinueReading } from "@/features/reading/ContinueReading";
import { MyLibrary } from "@/features/reading/MyLibrary";
import { YourFiles } from "@/features/imports/YourFiles";

export const metadata: Metadata = { title: "Reading Room" };

/**
 * The Reading Room, laid out like a file explorer: a task pane (things to do, places, details)
 * beside folders for what you're reading, your favourites, your own files and the bookshelf.
 */
export default function ReadingPage() {
  const shelf = BOOKS.map(({ id, title, authors }) => ({ id, title, authors }));
  return (
    <div className="rx">
      <aside className="rx-tasks" aria-label="Reading Room tasks">
        <section className="rx-panel" aria-labelledby="rx-tasks-heading">
          <h2 id="rx-tasks-heading">Reading tasks</h2>
          <ul>
            <li>
              <a href="#your-files">Import your own book</a>
            </li>
            <li>
              <a href="#shelf">Search the bookshelf</a>
            </li>
          </ul>
        </section>
        <section className="rx-panel" aria-labelledby="rx-places-heading">
          <h2 id="rx-places-heading">Places</h2>
          <ul>
            <li>
              <a href="#reading-now">Continue reading</a>
            </li>
            <li>
              <a href="#my-library">Favourites and recent</a>
            </li>
            <li>
              <a href="#your-files">Your files</a>
            </li>
            <li>
              <a href="#shelf">Bookshelf</a>
            </li>
          </ul>
        </section>
        <section className="rx-panel" aria-labelledby="rx-details-heading">
          <h2 id="rx-details-heading">Details</h2>
          <p>
            {BOOKS.length} books, every one in the public domain in both India and the United States, each listing how that was checked. Your own files stay in
            this browser.
          </p>
        </section>
      </aside>

      <div className="rx-main">
        <div className="rx-head">
          <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden>
            <path d="M6 10 h14 a4 4 0 0 1 4 4 v26 a3 3 0 0 0 -3 -3 H6 Z" fill="#fffaf0" stroke="#1c2a4a" strokeWidth="1.4" />
            <path d="M42 10 H28 a4 4 0 0 0 -4 4 v26 a3 3 0 0 1 3 -3 h15 Z" fill="#fffaf0" stroke="#1c2a4a" strokeWidth="1.4" />
            <path d="M4 12 v29 h17 a3 3 0 0 1 3 2 a3 3 0 0 1 3 -2 h17 V12" fill="none" stroke="#2f8f6a" strokeWidth="3" />
          </svg>
          <div>
            <h1>Reading Room</h1>
            <p>Adventure, mystery and folk tales you can read in full, and your own EPUB and PDF books.</p>
          </div>
        </div>
        <div id="reading-now" className="rx-folder">
          <ContinueReading books={shelf} />
        </div>
        <div id="my-library" className="rx-folder">
          <MyLibrary books={shelf} />
        </div>
        <div id="your-files" className="rx-folder">
          <YourFiles />
        </div>
        <div id="shelf" className="rx-folder">
          <Bookshelf books={[...BOOKS]} />
        </div>
      </div>
    </div>
  );
}
