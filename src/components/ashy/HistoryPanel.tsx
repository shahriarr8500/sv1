/**
 * HistoryPanel — the Ashy chat history sidebar (shared by the desktop left
 * panel and the mobile drawer).
 *
 * Layout, top to bottom: [New chat] → search box → PINNED (collapsible,
 * drop target) → PROJECTS (collapsible, per-project expand, ⋯ menu) → CHATS
 * grouped Today / Yesterday / Previous 7 days / Previous 30 days / Older
 * with "Load more". While a search is active the sections are replaced by
 * the result list (title + snippet with the match highlighted).
 *
 * All mutations are dispatched upward — this component never talks to
 * Convex itself. Desktop gets drag-and-drop plus a hover/focus ⋯ menu;
 * mobile gets always-visible ⋯ buttons, long-press and a bottom action
 * sheet, so every action stays reachable without hover.
 */

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import {
  ArrowDown,
  Check,
  ChevronRight,
  FolderPlus,
  Loader2,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { AshyActionSheet, type AshySheetItem } from "@/components/ashy/AshyActionSheet";
import { cn } from "@/lib/utils";
import {
  groupChatsByDate,
  highlightMatch,
  type AshyChatRow,
  type AshyProjectRow,
  type AshySearchHit,
} from "@/lib/ashy";

export interface HistoryPanelProps {
  variant: "desktop" | "mobile";
  chats: AshyChatRow[];
  projects: AshyProjectRow[];
  activeId: string | null;
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onNewChat: () => void;
  onOpenChat: (id: string) => void;
  onRenameChat: (id: string, title: string) => void;
  onTogglePin: (chat: AshyChatRow) => void;
  onMoveChat: (id: string, projectId: string | null) => void;
  onDeleteChat: (id: string) => void;
  onCreateProject: (input: {
    name: string;
    emoji?: string;
    instructions?: string;
    moveChatId?: string;
  }) => void;
  onRenameProject: (id: string, name: string) => void;
  onUpdateProject: (
    id: string,
    patch: { emoji?: string | null; instructions?: string | null },
  ) => void;
  onDeleteProject: (id: string, mode: "move" | "delete") => void;
  search: {
    term: string;
    onTermChange: (term: string) => void;
    results: AshySearchHit[] | undefined;
    loading: boolean;
  };
}

/** Imperative handle so the page can focus the search box (Ctrl/Cmd+K). */
export interface HistoryPanelHandle {
  focusSearch: () => void;
}

/* -------------------------------------------------------------------------- */
/* Small pieces                                                                */
/* -------------------------------------------------------------------------- */

function SectionHeader({
  label,
  expanded,
  onToggle,
  action,
  dropActive,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
  dropActive?: boolean;
  onDragOver?: (event: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (event: React.DragEvent) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-lg px-1.5 py-1 transition-colors",
        dropActive && "ring-2 ring-primary/60 bg-primary/5",
      )}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-md py-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ChevronRight
          className={cn("size-3 transition-transform", expanded && "rotate-90")}
          aria-hidden
        />
        <span className="truncate">{label}</span>
      </button>
      {action}
    </div>
  );
}

function HighlightedSnippet({ hit, term }: { hit: AshySearchHit; term: string }) {
  const parts = highlightMatch(hit.snippet, term);
  return (
    <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">
      {parts.map((part, index) =>
        part.hit ? (
          <mark key={index} className="rounded-sm bg-primary/20 text-foreground">
            {part.chunk}
          </mark>      ) : (
        <span key={index}>{part.chunk}</span>
        ),
      )}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Panel                                                                       */
/* -------------------------------------------------------------------------- */

export const HistoryPanel = forwardRef<HistoryPanelHandle, HistoryPanelProps>(
  function HistoryPanel(props: HistoryPanelProps, ref) {
  const {
    variant,
    chats,
    projects,
    activeId,
    loading,
    hasMore,
    onLoadMore,
    onNewChat,
    onOpenChat,
    onRenameChat,
    onTogglePin,
    onMoveChat,
    onDeleteChat,
    onCreateProject,
    onRenameProject,
    onUpdateProject,
    onDeleteProject,
    search,
  } = props;
  const isMobile = variant === "mobile";

  const [pinsOpen, setPinsOpen] = useState(true);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<{
    kind: "chat" | "project";
    id: string;
    initial: string;
  } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [projectDialog, setProjectDialog] = useState<{
    mode: "create" | "name" | "details";
    project?: AshyProjectRow;
    moveChatId?: string;
  } | null>(null);
  const [projectForm, setProjectForm] = useState({
    name: "",
    emoji: "",
    instructions: "",
  });
  const [deleteProjectTarget, setDeleteProjectTarget] =
    useState<AshyProjectRow | null>(null);
  const [sheetChat, setSheetChat] = useState<AshyChatRow | null>(null);
  const [sheetView, setSheetView] = useState<"root" | "move">("root");
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const longPressFired = useRef(false);
  const longPressTimer = useRef<number | null>(null);

  useImperativeHandle(ref, () => ({
    focusSearch: () => searchInputRef.current?.focus(),
  }));

  const searching = search.term.trim().length >= 2;
  const pinned = chats.filter((chat) => chat.pinned);
  const unpinned = chats.filter((chat) => !chat.pinned);
  const grouped = groupChatsByDate(unpinned);
  const projectById = new Map(projects.map((project) => [project.id, project]));

  /* --- actions ---------------------------------------------------------- */

  const openRename = (kind: "chat" | "project", id: string, initial: string) => {
    setRenameTarget({ kind, id, initial });
    setRenameValue(initial);
  };

  const submitRename = () => {
    if (!renameTarget) return;
    const value = renameValue.trim();
    if (value) {
      if (renameTarget.kind === "chat") onRenameChat(renameTarget.id, value);
      else onRenameProject(renameTarget.id, value);
    }
    setRenameTarget(null);
  };

  const openCreateProject = (moveChatId?: string) => {
    setProjectForm({ name: "", emoji: "", instructions: "" });
    setProjectDialog({ mode: "create", moveChatId });
  };

  const openProjectDetails = (project: AshyProjectRow) => {
    setProjectForm({
      name: project.name,
      emoji: project.emoji ?? "",
      instructions: project.instructions ?? "",
    });
    setProjectDialog({ mode: "details", project });
  };

  const submitProjectDialog = () => {
    if (!projectDialog) return;
    const name = projectForm.name.trim();
    const emoji = projectForm.emoji.trim();
    const instructions = projectForm.instructions.trim();
    if (projectDialog.mode === "create") {
      if (!name) return;
      onCreateProject({
        name,
        emoji: emoji || undefined,
        instructions: instructions || undefined,
        moveChatId: projectDialog.moveChatId,
      });
    } else if (projectDialog.project) {
      if (projectDialog.mode === "name" && name) {
        onRenameProject(projectDialog.project.id, name);
      }
      onUpdateProject(projectDialog.project.id, {
        emoji: emoji || null,
        instructions: instructions || null,
      });
    }
    setProjectDialog(null);
  };

  /* --- keyboard --------------------------------------------------------- */

  const moveFocus = (direction: 1 | -1) => {
    const container = containerRef.current;
    if (!container) return;
    const rows = Array.from(
      container.querySelectorAll<HTMLButtonElement>("[data-chat-row]"),
    );
    if (rows.length === 0) return;
    const index = rows.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      direction === 1
        ? Math.min(index + 1, rows.length - 1)
        : Math.max(index - 1, 0);
    rows[next === -1 ? 0 : next]?.focus();
  };

  const onRowKeyDown = (
    event: React.KeyboardEvent,
    chat: AshyChatRow,
  ) => {
    if (event.key === "F2") {
      event.preventDefault();
      openRename("chat", chat.id, chat.title);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onDeleteChat(chat.id);
    }
  };

  /* --- drag and drop (desktop only) ------------------------------------- */

  const isDesktopDnd = variant === "desktop";
  const dragProps = (chatId: string) =>
    isDesktopDnd
      ? {
          draggable: true,
          onDragStart: (event: React.DragEvent) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", chatId);
          },
          onDragEnd: () => {
            setDropTarget(null);
          },
        }
      : {};

  const dropProps = (target: string, apply: (chatId: string) => void) =>
    isDesktopDnd
      ? {
          onDragOver: (event: React.DragEvent) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            if (dropTarget !== target) setDropTarget(target);
          },
          onDragLeave: () => setDropTarget((current) => (current === target ? null : current)),
          onDrop: (event: React.DragEvent) => {
            event.preventDefault();
            setDropTarget(null);
            const chatId = event.dataTransfer.getData("text/plain");
            if (chatId) apply(chatId);
          },
        }
      : {};

  /* --- long press (mobile) ---------------------------------------------- */

  const startLongPress = (chat: AshyChatRow) => {
    if (!isMobile) return;
    longPressFired.current = false;
    longPressTimer.current = window.setTimeout(() => {
      longPressFired.current = true;
      setSheetView("root");
      setSheetChat(chat);
    }, 550);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  /* --- chat row ---------------------------------------------------------- */

  const renderChatRow = (chat: AshyChatRow) => {
    const project = chat.projectId ? projectById.get(chat.projectId) : undefined;
    return (
      <li key={chat.id}>
        <div
          data-chat-row=""
          {...dragProps(chat.id)}
          onTouchStart={() => startLongPress(chat)}
          onTouchMove={cancelLongPress}
          onTouchEnd={cancelLongPress}
          onTouchCancel={cancelLongPress}
          className={cn(
            "group relative flex min-w-0 items-center gap-0.5 rounded-lg transition-colors",
            isMobile ? "min-h-11" : "min-h-9",
            chat.id === activeId
              ? "bg-primary/10 text-primary"
              : "hover:bg-accent/60",
          )}
        >
          <button
            type="button"
            onClick={() => {
              if (longPressFired.current) {
                longPressFired.current = false;
                return;
              }
              onOpenChat(chat.id);
            }}
            onKeyDown={(event) => onRowKeyDown(event, chat)}
            title={chat.title}
            aria-current={chat.id === activeId ? "page" : undefined}
            className="min-w-0 flex-1 cursor-pointer truncate rounded-lg px-2.5 py-1.5 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {chat.title}
            {project ? (
              <span className="ml-1.5 text-[10px] text-muted-foreground">
                {project.emoji ? `${project.emoji} ` : ""}
                {project.name}
              </span>
            ) : null}
          </button>

          {/* Desktop: hover/focus ⋯ menu. Mobile: always-visible ⋯ sheet. */}
          {isMobile ? (
            <button
              type="button"
              aria-label={`Options for ${chat.title}`}
              onClick={() => {
                setSheetView("root");
                setSheetChat(chat);
              }}
              className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg text-muted-foreground active:bg-accent"
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Options for ${chat.title}`}
                  className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:opacity-100"
                >
                  <MoreHorizontal className="size-4" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem
                  className="cursor-pointer"
                  onSelect={() => openRename("chat", chat.id, chat.title)}
                >
                  <Pencil className="size-4" aria-hidden />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer"
                  onSelect={() => onTogglePin(chat)}
                >
                  {chat.pinned ? (
                    <PinOff className="size-4" aria-hidden />
                  ) : (
                    <Pin className="size-4" aria-hidden />
                  )}
                  {chat.pinned ? "Unpin" : "Pin"}
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="cursor-pointer">
                    Move to project
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onSelect={() => onMoveChat(chat.id, null)}
                    >
                      No project
                    </DropdownMenuItem>
                    {projects.map((row) => (
                      <DropdownMenuItem
                        key={row.id}
                        className="cursor-pointer"
                        onSelect={() => onMoveChat(chat.id, row.id)}
                      >
                        <span className="truncate">
                          {row.emoji ? `${row.emoji} ` : ""}
                          {row.name}
                        </span>
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onSelect={() => openCreateProject(chat.id)}
                    >
                      <FolderPlus className="size-4" aria-hidden />
                      New project…
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer text-destructive focus:text-destructive"
                  onSelect={() => onDeleteChat(chat.id)}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </li>
    );
  };

  /* --- mobile sheet ------------------------------------------------------ */

  const sheetItems: AshySheetItem[] =
    sheetView === "root" && sheetChat
      ? [
          { key: "rename", label: "Rename", icon: <Pencil className="size-4" /> },
          {
            key: "pin",
            label: sheetChat.pinned ? "Unpin" : "Pin",
            icon: sheetChat.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />,
          },
          { key: "move", label: "Move to project", icon: <FolderPlus className="size-4" /> },
          {
            key: "delete",
            label: "Delete",
            icon: <Trash2 className="size-4" />,
            danger: true,
          },
        ]
      : [
          { key: "no-project", label: "No project" },
          ...projects.map((project) => ({
            key: `project:${project.id}`,
            label: project.emoji ? `${project.emoji} ${project.name}` : project.name,
          })),
          { key: "new-project", label: "New project…", icon: <FolderPlus className="size-4" /> },
        ];

  const onSheetSelect = (key: string) => {
    if (!sheetChat) return;
    if (sheetView === "root") {
      if (key === "rename") {
        openRename("chat", sheetChat.id, sheetChat.title);
        setSheetChat(null);
      } else if (key === "pin") {
        onTogglePin(sheetChat);
        setSheetChat(null);
      } else if (key === "move") {
        setSheetView("move");
      } else if (key === "delete") {
        onDeleteChat(sheetChat.id);
        setSheetChat(null);
      }
      return;
    }
    if (key === "no-project") onMoveChat(sheetChat.id, null);
    else if (key === "new-project") openCreateProject(sheetChat.id);
    else if (key.startsWith("project:")) {
      onMoveChat(sheetChat.id, key.slice("project:".length));
    }
    setSheetChat(null);
  };

  /* --- render ----------------------------------------------------------- */

  return (
    <div
      ref={containerRef}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          moveFocus(event.key === "ArrowDown" ? 1 : -1);
        }
      }}
      className="flex h-full min-h-0 flex-col rounded-xl border bg-card/40"
    >
      <div className="space-y-2 border-b p-3">
        <Button
          type="button"
          onClick={onNewChat}
          className="w-full cursor-pointer justify-start gap-2"
        >
          <Plus className="size-4" aria-hidden />
          New chat
        </Button>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            ref={searchInputRef}
            value={search.term}
            onChange={(event) => search.onTermChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && search.term) {
                event.preventDefault();
                event.stopPropagation();
                search.onTermChange("");
              }
            }}
            placeholder="Search chats…"
            aria-label="Search your chats"
            className="h-9 pr-8 pl-8"
          />
          {search.term ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => search.onTermChange("")}
              className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 cursor-pointer place-items-center rounded-md text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2">
        {searching ? (
          search.loading && !search.results ? (
            <div className="space-y-2 px-1 py-2">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : (search.results?.length ?? 0) === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              No chats match “{search.term.trim()}”.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {search.results?.map((hit) => (
                <li key={hit.conversationId}>
                  <button
                    type="button"
                    onClick={() => onOpenChat(hit.conversationId)}
                    className={cn(
                      "w-full cursor-pointer rounded-lg px-2.5 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      hit.conversationId === activeId
                        ? "bg-primary/10"
                        : "hover:bg-accent/60",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="min-w-0 truncate text-sm font-medium">
                        {hit.title}
                      </span>
                      <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                        {hit.matchedIn === "title" ? "title" : "message"}
                      </span>
                    </span>
                    <HighlightedSnippet hit={hit} term={search.term} />
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : (
          <>
            {/* PINNED */}
            <section>
              <SectionHeader
                label="Pinned"
                expanded={pinsOpen}
                onToggle={() => setPinsOpen((open) => !open)}
                dropActive={dropTarget === "pinned"}
                {...dropProps("pinned", (chatId) => {
                  const chat = chats.find((row) => row.id === chatId);
                  if (chat && !chat.pinned) onTogglePin(chat);
                })}
              />
              {pinsOpen ? (
                pinned.length === 0 ? (
                  <p className="px-3 py-1.5 text-xs text-muted-foreground">
                    No pinned chats yet — pin one from its ⋯ menu.
                  </p>
                ) : (
                  <ul className="space-y-0.5">{pinned.map(renderChatRow)}</ul>
                )
              ) : null}
            </section>

            {/* PROJECTS */}
            <section>
              <SectionHeader
                label="Projects"
                expanded={projectsOpen}
                onToggle={() => setProjectsOpen((open) => !open)}
                action={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => openCreateProject()}
                    className="h-7 shrink-0 cursor-pointer gap-1 px-2 text-xs text-muted-foreground"
                  >
                    <FolderPlus className="size-3.5" aria-hidden />
                    New project
                  </Button>
                }
              />
              {projectsOpen ? (
                projects.length === 0 ? (
                  <p className="px-3 py-1.5 text-xs text-muted-foreground">
                    No projects yet — create one to group related chats.
                  </p>
                ) : (
                  <ul className="space-y-0.5">
                    {projects.map((project) => {
                      const inside = chats.filter(
                        (chat) => chat.projectId === project.id,
                      );
                      const expanded = expandedProjectId === project.id;
                      return (
                        <li key={project.id}>
                          <div
                            {...dropProps(project.id, (chatId) =>
                              onMoveChat(chatId, project.id),
                            )}
                            className={cn(
                              "flex min-w-0 items-center gap-0.5 rounded-lg transition-colors",
                              dropTarget === project.id &&
                                "ring-2 ring-primary/60 bg-primary/5",
                            )}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedProjectId((current) =>
                                  current === project.id ? null : project.id,
                                )
                              }
                              aria-expanded={expanded}
                              title={project.name}
                              className="flex min-h-9 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            >
                              <ChevronRight
                                className={cn(
                                  "size-3.5 shrink-0 text-muted-foreground transition-transform",
                                  expanded && "rotate-90",
                                )}
                                aria-hidden
                              />
                              <span className="shrink-0 text-sm">
                                {project.emoji ?? "📁"}
                              </span>
                              <span className="min-w-0 flex-1 truncate">
                                {project.name}
                              </span>
                              <span className="shrink-0 text-[11px] text-muted-foreground">
                                {project.chatCount}
                              </span>
                            </button>
                            {isMobile ? (
                              <button
                                type="button"
                                aria-label={`Options for project ${project.name}`}
                                onClick={() => openProjectDetails(project)}
                                className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg text-muted-foreground active:bg-accent"
                              >
                                <MoreHorizontal className="size-4" aria-hidden />
                              </button>
                            ) : (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    aria-label={`Options for project ${project.name}`}
                                    className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:opacity-100"
                                  >
                                    <MoreHorizontal className="size-4" aria-hidden />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  <DropdownMenuItem
                                    className="cursor-pointer"
                                    onSelect={() =>
                                      openRename("project", project.id, project.name)
                                    }
                                  >
                                    <Pencil className="size-4" aria-hidden />
                                    Rename
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="cursor-pointer"
                                    onSelect={() => openProjectDetails(project)}
                                  >
                                    Edit instructions
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="cursor-pointer text-destructive focus:text-destructive"
                                    onSelect={() => setDeleteProjectTarget(project)}
                                  >
                                    <Trash2 className="size-4" aria-hidden />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                          {expanded ? (
                            inside.length === 0 ? (
                              <p className="px-6 py-1.5 text-xs text-muted-foreground">
                                No chats here yet — drag one in, or start a new
                                chat from this project.
                              </p>
                            ) : (
                              <ul className="space-y-0.5">{inside.map(renderChatRow)}</ul>
                            )
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )
              ) : null}
            </section>

            {/* CHATS */}
            <section>
              <div className="px-1.5 pt-1 pb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Chats
              </div>
              {loading ? (
                <div className="space-y-2 px-1 py-1">
                  {[0, 1, 2, 3, 4].map((index) => (
                    <Skeleton key={index} className="h-9 w-full" />
                  ))}
                </div>
              ) : chats.length === 0 ? (
                <p className="px-3 py-1.5 text-xs text-muted-foreground">
                  No chats yet — say hi to Ashy.
                </p>
              ) : (
                grouped.map((group) => (
                  <div key={group.label} className="pb-1">
                    <p className="px-3 py-1 text-[11px] text-muted-foreground">
                      {group.label}
                    </p>
                    <ul className="space-y-0.5">{group.chats.map(renderChatRow)}</ul>
                  </div>
                ))
              )}
              {hasMore ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onLoadMore}
                  className="mt-1 w-full cursor-pointer gap-1.5 text-xs"
                >
                  {loading ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <ArrowDown className="size-3.5" aria-hidden />
                  )}
                  Load more
                </Button>
              ) : null}
            </section>
          </>
        )}
      </div>

      {/* Rename (chat or project) */}
      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Rename {renameTarget?.kind === "project" ? "project" : "chat"}
            </DialogTitle>
            <DialogDescription>
              {renameTarget?.kind === "project"
                ? "Give this project a short name."
                : "This name replaces the auto-generated title."}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitRename();
              }
            }}
            maxLength={60}
            autoFocus
            aria-label="New name"
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRenameTarget(null)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={submitRename} disabled={!renameValue.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create project / edit instructions */}
      <Dialog
        open={projectDialog !== null}
        onOpenChange={(open) => {
          if (!open) setProjectDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {projectDialog?.mode === "create"
                ? "New project"
                : projectDialog?.mode === "name"
                  ? "Rename project"
                  : "Project instructions"}
            </DialogTitle>
            <DialogDescription>
              Projects group related chats. Instructions are your own note for
              Ashy inside this project — they never override Ashy's rules.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {projectDialog?.mode !== "details" ? (
              <div className="flex gap-2">
                <Input
                  value={projectForm.name}
                  onChange={(event) =>
                    setProjectForm((form) => ({ ...form, name: event.target.value }))
                  }
                  placeholder="Project name"
                  maxLength={60}
                  autoFocus
                  aria-label="Project name"
                  className="flex-1"
                />
                <Input
                  value={projectForm.emoji}
                  onChange={(event) =>
                    setProjectForm((form) => ({ ...form, emoji: event.target.value }))
                  }
                  placeholder="🎓"
                  maxLength={8}
                  aria-label="Project emoji"
                  className="w-20"
                />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xl">{projectForm.emoji || "📁"}</span>
                <span className="min-w-0 truncate text-sm font-medium">
                  {projectForm.name}
                </span>
              </div>
            )}
            <textarea
              value={projectForm.instructions}
              onChange={(event) =>
                setProjectForm((form) => ({
                  ...form,
                  instructions: event.target.value,
                }))
              }
              placeholder={'Optional: e.g. "Prefer HSC-board examples, keep answers exam-focused."'}
              maxLength={2000}
              rows={4}
              aria-label="Project instructions"
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setProjectDialog(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submitProjectDialog}
              disabled={
                projectDialog?.mode !== "details" && !projectForm.name.trim()
              }
            >
              {projectDialog?.mode === "create" ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete project: move chats out, or delete them too */}
      <Dialog
        open={deleteProjectTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteProjectTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete “{deleteProjectTarget?.name}”?</DialogTitle>
            <DialogDescription>
              It has {deleteProjectTarget?.chatCount ?? 0} chat
              {(deleteProjectTarget?.chatCount ?? 0) === 1 ? "" : "s"}. Choose
              what happens to them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              type="button"
              className="w-full cursor-pointer"
              onClick={() => {
                if (deleteProjectTarget) {
                  onDeleteProject(deleteProjectTarget.id, "move");
                }
                setDeleteProjectTarget(null);
              }}
            >
              Move chats to Chats
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="w-full cursor-pointer"
              onClick={() => {
                if (deleteProjectTarget) {
                  onDeleteProject(deleteProjectTarget.id, "delete");
                }
                setDeleteProjectTarget(null);
              }}
            >
              Delete the {deleteProjectTarget?.chatCount ?? 0} chat
              {(deleteProjectTarget?.chatCount ?? 0) === 1 ? "" : "s"} too
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full cursor-pointer"
              onClick={() => setDeleteProjectTarget(null)}
            >
              <Check className="size-4" aria-hidden />
              Keep project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mobile action sheet */}
      <AshyActionSheet
        open={sheetChat !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSheetChat(null);
            setSheetView("root");
          }
        }}
        title={
          sheetView === "move"
            ? "Move chat to project"
            : (sheetChat?.title ?? "Chat options")
        }
        items={sheetItems}
        onSelect={onSheetSelect}
      />
    </div>
  );
  },
);
