import raw from "../../../content/books/catalogue.json";
import { parseCatalogue, type Book } from "./catalogue";

/**
 * The validated catalogue. Parsing happens when the module loads, so an invalid
 * rights record fails the build instead of reaching visitors.
 */
export const BOOKS: readonly Book[] = parseCatalogue(raw);

export function getBook(id: string): Book | undefined {
  return BOOKS.find((b) => b.id === id);
}
