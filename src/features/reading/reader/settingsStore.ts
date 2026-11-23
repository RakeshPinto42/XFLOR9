"use client";

import { STORAGE_KEYS } from "@/lib/storage/local";
import { createLocalStore } from "@/lib/storage/store";
import { DEFAULT_SETTINGS, parseSettings } from "./settings";

/** Reader theme and text size, shared by the catalogue reader and the imported-book reader. */
export const readerSettings = createLocalStore(STORAGE_KEYS.readerSettings, DEFAULT_SETTINGS, parseSettings);
