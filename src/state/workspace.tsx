/**
 * Workspace state — customer posts, comments, bookings, and catalog
 * moderation, persisted through the workspace repository.
 *
 * Kept separate from the Student OS profile/progress provider so syllabus
 * state and workspace state never interfere with each other.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { SEED_CATALOG, type CatalogItem } from "@/lib/student-os/catalog";
import {
  makeReference,
  workspaceRepository,
  type WorkspaceBooking,
  type WorkspaceComment,
  type WorkspaceState,
} from "@/lib/student-os/workspace";

export type NewCatalogPost = Omit<CatalogItem, "id" | "source" | "createdAt">;

interface WorkspaceContextValue {
  workspace: WorkspaceState;
  /** Publishes customer content; returns the new item id. */
  addPost: (post: NewCatalogPost) => string;
  /** Admin: remove a catalog item (seed items are hidden, never mutated). */
  removeItem: (itemId: string) => void;
  /** Admin: bring a removed catalog item back. */
  restoreItem: (itemId: string) => void;
  addComment: (itemId: string, author: string, body: string) => void;
  deleteComment: (commentId: string) => void;
  createBooking: (input: {
    itemId: string;
    title: string;
    amount: number;
    date?: string;
    time?: string;
    customer: string;
  }) => WorkspaceBooking;
  setBookingStatus: (bookingId: string, status: WorkspaceBooking["status"]) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function arrayDifference(values: string[], removeId: string): string[] {
  return values.filter((value) => value !== removeId);
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<WorkspaceState>(() =>
    workspaceRepository.load(),
  );

  // Persist on every change so customer data survives refreshes.
  useEffect(() => {
    workspaceRepository.save(workspace);
  }, [workspace]);

  const addPost = useCallback((post: NewCatalogPost) => {
    const id = `post-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const item: CatalogItem = {
      ...post,
      id,
      source: "user",
      createdAt: Date.now(),
    };
    setWorkspace((previous) => ({ ...previous, posts: [item, ...previous.posts] }));
    return id;
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setWorkspace((previous) => {
      if (previous.posts.some((post) => post.id === itemId)) {
        // Customer posts are deleted outright.
        return { ...previous, posts: previous.posts.filter((post) => post.id !== itemId) };
      }
      if (previous.removedItemIds.includes(itemId)) return previous;
      return { ...previous, removedItemIds: [...previous.removedItemIds, itemId] };
    });
  }, []);

  const restoreItem = useCallback((itemId: string) => {
    setWorkspace((previous) => ({
      ...previous,
      removedItemIds: arrayDifference(previous.removedItemIds, itemId),
    }));
  }, []);

  const addComment = useCallback((itemId: string, author: string, body: string) => {
    const comment: WorkspaceComment = {
      id: `comment-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 6)}`,
      itemId,
      author,
      body,
      createdAt: Date.now(),
    };
    setWorkspace((previous) => ({
      ...previous,
      comments: [...previous.comments, comment],
    }));
  }, []);

  const deleteComment = useCallback((commentId: string) => {
    setWorkspace((previous) => ({
      ...previous,
      comments: previous.comments.filter((comment) => comment.id !== commentId),
    }));
  }, []);

  const createBooking = useCallback<WorkspaceContextValue["createBooking"]>(
    (input) => {
      const booking: WorkspaceBooking = {
        id: `booking-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 6)}`,
        itemId: input.itemId,
        title: input.title,
        amount: input.amount,
        date: input.date,
        time: input.time,
        customer: input.customer,
        status: "confirmed",
        reference: makeReference(),
        createdAt: Date.now(),
      };
      setWorkspace((previous) => ({
        ...previous,
        bookings: [booking, ...previous.bookings],
      }));
      return booking;
    },
    [],
  );

  const setBookingStatus = useCallback(
    (bookingId: string, status: WorkspaceBooking["status"]) => {
      setWorkspace((previous) => ({
        ...previous,
        bookings: previous.bookings.map((booking) =>
          booking.id === bookingId ? { ...booking, status } : booking,
        ),
      }));
    },
    [],
  );

  const value = useMemo(
    () => ({
      workspace,
      addPost,
      removeItem,
      restoreItem,
      addComment,
      deleteComment,
      createBooking,
      setBookingStatus,
    }),
    [
      workspace,
      addPost,
      removeItem,
      restoreItem,
      addComment,
      deleteComment,
      createBooking,
      setBookingStatus,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}

/** Full catalog: customer posts (newest first), then seeds, minus removals. */
export function useCatalogItems(): CatalogItem[] {
  const { workspace } = useWorkspace();
  return useMemo(() => {
    const removed = new Set(workspace.removedItemIds);
    const posts = workspace.posts.filter((post) => !removed.has(post.id));
    const seeds = SEED_CATALOG.filter((seed) => !removed.has(seed.id));
    return [...posts, ...seeds];
  }, [workspace]);
}

export function useCatalogItem(itemId: string | undefined): CatalogItem | undefined {
  const items = useCatalogItems();
  return useMemo(
    () => (itemId ? items.find((item) => item.id === itemId) : undefined),
    [items, itemId],
  );
}

export function useItemComments(itemId: string): WorkspaceComment[] {
  const { workspace } = useWorkspace();
  return useMemo(
    () =>
      workspace.comments
        .filter((comment) => comment.itemId === itemId)
        .sort((a, b) => a.createdAt - b.createdAt),
    [workspace.comments, itemId],
  );
}

export function useBookings(): WorkspaceBooking[] {
  const { workspace } = useWorkspace();
  return workspace.bookings;
}
