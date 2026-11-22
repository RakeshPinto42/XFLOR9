"use client";

import { useSyncExternalStore } from "react";
import { readJson, writeJson } from "./local";

/**
 * A remembered value in localStorage that React components can read and subscribe to.
 * - `parse` validates what comes back from storage (it may be old, corrupted or edited by hand).
 * - Changes in another tab arrive through the browser's "storage" event, so tabs stay in sync.
 */
export interface LocalStore<T> {
  readonly fallback: T;
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(listener: () => void): () => void;
}

export function createLocalStore<T>(key: string, fallback: T, parse: (raw: unknown) => T): LocalStore<T> {
  let cache: { value: T } | null = null;
  const listeners = new Set<() => void>();

  const load = (): T => {
    try {
      return parse(readJson<unknown>(key, fallback));
    } catch {
      return fallback;
    }
  };
  const emit = () => listeners.forEach((l) => l());
  const onStorage = (e: StorageEvent) => {
    if (e.key !== key && e.key !== null) return; // null = storage cleared
    cache = { value: load() };
    emit();
  };

  const store: LocalStore<T> = {
    fallback,
    get() {
      if (typeof window === "undefined") return fallback;
      if (!cache) cache = { value: load() };
      return cache.value;
    },
    set(next) {
      const value = typeof next === "function" ? (next as (prev: T) => T)(store.get()) : next;
      cache = { value };
      writeJson(key, value);
      emit();
    },
    subscribe(listener) {
      if (listeners.size === 0 && typeof window !== "undefined") window.addEventListener("storage", onStorage);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && typeof window !== "undefined") window.removeEventListener("storage", onStorage);
      };
    },
  };
  return store;
}

/** Read a store in a component. Server render and first paint use the fallback, then the saved value. */
export function useLocalStore<T>(store: LocalStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, () => store.fallback);
}
