/**
 * Reference counting for loaded GPU resources (models, textures). Each scene acquires what it
 * uses and releases it on unmount; a resource is disposed only when nothing uses it any more,
 * so scenes sharing an asset don't pull it out from under each other.
 */
export class ResourceTracker<T> {
  private entries = new Map<string, { value: T; refs: number }>();

  constructor(private readonly dispose: (value: T, key: string) => void) {}

  /** Returns the cached value (creating it once) and counts the new user. */
  acquire(key: string, create: () => T): T {
    const entry = this.entries.get(key);
    if (entry) {
      entry.refs += 1;
      return entry.value;
    }
    const value = create();
    this.entries.set(key, { value, refs: 1 });
    return value;
  }

  /** One user is done. Disposes the resource when no users remain. Returns true if disposed. */
  release(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    entry.refs -= 1;
    if (entry.refs > 0) return false;
    this.entries.delete(key);
    this.dispose(entry.value, key);
    return true;
  }

  refs(key: string): number {
    return this.entries.get(key)?.refs ?? 0;
  }

  keys(): string[] {
    return [...this.entries.keys()];
  }
}
