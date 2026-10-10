/**
 * ChatHeader — the compact, always-visible top row of the Ashy chat.
 *
 * [History toggle] [chat title → rename] [project chip] [New chat] [⋯ menu]
 * [Settings]. It stays a single row down to 360px: wide labels collapse to
 * icons on small screens. The ⋯ menu (desktop) and the bottom action sheet
 * (mobile) expose the same actions, so touch users never depend on hover.
 */

import {
  Download,
  FolderPlus,
  MoreHorizontal,
  PanelLeft,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { AshyPrefs, AshyProjectRow } from "@/lib/ashy";

export interface ChatHeaderProps {
  title: string;
  hasChat: boolean;
  pinned: boolean;
  project?: AshyProjectRow | null;
  projects: AshyProjectRow[];
  panelOpen: boolean;
  prefs: AshyPrefs;
  onPrefsChange: (prefs: AshyPrefs) => void;
  onToggleHistory: () => void;
  onNewChat: () => void;
  onRenameChat: () => void;
  onTogglePin: () => void;
  onMoveChat: (projectId: string | null) => void;
  onNewProjectForChat: () => void;
  onExport: (format: "text" | "markdown") => void;
  onDeleteChat: () => void;
}

function Seg<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <div
        role="group"
        aria-label={label}
        className="flex gap-0.5 rounded-md border p-0.5"
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex-1 cursor-pointer rounded px-2 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              value === option.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ChatHeader(props: ChatHeaderProps) {
  const {
    title,
    hasChat,
    pinned,
    project,
    projects,
    panelOpen,
    prefs,
    onPrefsChange,
    onToggleHistory,
    onNewChat,
    onRenameChat,
    onTogglePin,
    onMoveChat,
    onNewProjectForChat,
    onExport,
    onDeleteChat,
  } = props;
  return (
    <div className="flex items-center gap-1.5 border-b pb-2.5">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Chat history"
        aria-pressed={panelOpen}
        title="Chat history"
        onClick={onToggleHistory}
        className="shrink-0"
      >
        <PanelLeft className="size-4" aria-hidden />
      </Button>

      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {hasChat ? (
          <button
            type="button"
            onClick={onRenameChat}
            title={title}
            aria-label={`Rename chat: ${title}`}
            className="min-w-0 max-w-full cursor-pointer truncate rounded-md px-1 text-left text-base font-bold tracking-tight hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:text-lg"
          >
            {title}
          </button>
        ) : (
          <span className="flex min-w-0 items-center gap-1.5 px-1">
            <span
              aria-hidden
              className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
            >
              <Sparkles className="size-4" />
            </span>
            <span className="truncate text-base font-bold tracking-tight sm:text-lg">
              Ashy
            </span>
          </span>
        )}
        {project ? (
          <span
            title={`In project: ${project.name}`}
            className="inline-flex max-w-32 shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
          >
            <span className="truncate">
              {project.emoji ? `${project.emoji} ` : ""}
              {project.name}
            </span>
          </span>
        ) : null}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onNewChat}
        className="shrink-0 cursor-pointer gap-1.5"
      >
        <Plus className="size-3.5" aria-hidden />
        <span className="hidden sm:inline">New chat</span>
      </Button>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Ashy settings"
            title="Ashy settings"
            className="shrink-0 text-muted-foreground"
          >
            <Settings2 className="size-4" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 space-y-3">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Ashy settings
          </p>
          <Seg
            label="Text size"
            value={prefs.textSize}
            options={[
              { value: "sm", label: "Small" },
              { value: "md", label: "Medium" },
              { value: "lg", label: "Large" },
            ]}
            onChange={(textSize) => onPrefsChange({ ...prefs, textSize })}
          />
          <Seg
            label="Density"
            value={prefs.density}
            options={[
              { value: "comfortable", label: "Comfortable" },
              { value: "compact", label: "Compact" },
            ]}
            onChange={(density) => onPrefsChange({ ...prefs, density })}
          />
          <Seg
            label="Answer length"
            value={prefs.answerLength}
            options={[
              { value: "concise", label: "Concise" },
              { value: "balanced", label: "Balanced" },
              { value: "detailed", label: "Detailed" },
            ]}
            onChange={(answerLength) => onPrefsChange({ ...prefs, answerLength })}
          />
          <label className="flex cursor-pointer items-center justify-between gap-2 text-sm">
            <span>Enter to send</span>
            <input
              type="checkbox"
              checked={prefs.enterToSend}
              onChange={(event) =>
                onPrefsChange({ ...prefs, enterToSend: event.target.checked })
              }
              className="size-4 cursor-pointer accent-primary"
            />
          </label>
          <p className="text-[11px] text-muted-foreground">
            Saved on this device. Answer length is a gentle preference — it
            never changes Ashy's safety rules.
          </p>
        </PopoverContent>
      </Popover>

      {hasChat ? (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Chat menu"
                title="Chat menu"
                className="shrink-0 text-muted-foreground"
              >
                <MoreHorizontal className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem className="cursor-pointer" onSelect={onRenameChat}>
                <Pencil className="size-4" aria-hidden />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onSelect={onTogglePin}>
                {pinned ? (
                  <PinOff className="size-4" aria-hidden />
                ) : (
                  <Pin className="size-4" aria-hidden />
                )}
                {pinned ? "Unpin" : "Pin"}
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="cursor-pointer">
                  Move to project
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onSelect={() => onMoveChat(null)}
                  >
                    No project
                  </DropdownMenuItem>
                  {projects.map((row) => (
                    <DropdownMenuItem
                      key={row.id}
                      className="cursor-pointer"
                      onSelect={() => onMoveChat(row.id)}
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
                    onSelect={onNewProjectForChat}
                  >
                    <FolderPlus className="size-4" aria-hidden />
                    New project…
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer"
                onSelect={() => onExport("text")}
              >
                <Download className="size-4" aria-hidden />
                Copy as text
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onSelect={() => onExport("markdown")}
              >
                <Download className="size-4" aria-hidden />
                Copy as Markdown
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive"
                onSelect={onDeleteChat}
              >
                <Trash2 className="size-4" aria-hidden />
                Delete chat
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : null}
    </div>
  );
}
