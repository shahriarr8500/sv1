/**
 * Workspace persistence — customer posts, comments, bookings, and catalog
 * moderation state.
 *
 * Version 1 stores everything in localStorage behind a repository interface,
 * mirroring `storage.ts`, so migrating to a database later only touches this
 * file.
 */

import type { CatalogItem } from "./catalog";

export interface WorkspaceComment {
  id: string;
  itemId: string;
  author: string;
  body: string;
  createdAt: number;
}

export interface WorkspaceBooking {
  id: string;
  itemId: string;
  title: string;
  /** Amount charged at checkout, in taka. */
  amount: number;
  /** ISO date (YYYY-MM-DD) chosen at booking; absent for self-paced items. */
  date?: string;
  /** Chosen slot label, e.g. "4:00 PM". */
  time?: string;
  customer: string;
  status: "confirmed" | "cancelled";
  reference: string;
  createdAt: number;
}

export interface WorkspaceState {
  version: 1;
  /** Items customers posted through the catalog. */
  posts: CatalogItem[];
  /** Catalog items an admin removed (seed entries are never mutated). */
  removedItemIds: string[];
  comments: WorkspaceComment[];
  bookings: WorkspaceBooking[];
}

export interface WorkspaceRepository {
  load(): WorkspaceState;
  save(state: WorkspaceState): void;
}

const STORAGE_KEY = "student-os:workspace:v1";

function emptyState(): WorkspaceState {
  return { version: 1, posts: [], removedItemIds: [], comments: [], bookings: [] };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function load(): WorkspaceState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) return emptyState();
    return {
      version: 1,
      posts: Array.isArray(parsed.posts) ? (parsed.posts as CatalogItem[]) : [],
      removedItemIds: Array.isArray(parsed.removedItemIds)
        ? (parsed.removedItemIds as string[])
        : [],
      comments: Array.isArray(parsed.comments)
        ? (parsed.comments as WorkspaceComment[])
        : [],
      bookings: Array.isArray(parsed.bookings)
        ? (parsed.bookings as WorkspaceBooking[])
        : [],
    };
  } catch {
    // Corrupt or unavailable storage — start clean rather than crash.
    return emptyState();
  }
}

function save(state: WorkspaceState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked — the app keeps working in memory.
  }
}

export const workspaceRepository: WorkspaceRepository = { load, save };

export function makeReference(): string {
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `SO-${suffix}`;
}
