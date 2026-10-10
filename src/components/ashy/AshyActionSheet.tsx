/**
 * AshyActionSheet — the mobile/touch action menu for a chat row or project.
 *
 * A bottom sheet (max-height 92dvh, safe-area padding) with large touch
 * targets; tapping the backdrop closes it. Desktop users always reach the
 * same actions through the row's ⋯ menu, so this sheet never carries an
 * action that only it can reach.
 */

import { X } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

export interface AshySheetItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
}

export function AshyActionSheet({
  open,
  onOpenChange,
  title,
  items,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  items: AshySheetItem[];
  onSelect: (key: string) => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className="max-h-[92dvh] rounded-t-2xl border-t"
        style={{
          paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)",
        }}
      >
        <DrawerTitle className="sr-only">{title}</DrawerTitle>
        <DrawerDescription className="sr-only">
          Choose an action
        </DrawerDescription>
        <div
          aria-hidden
          className="mx-auto mt-2 mb-1 h-1.5 w-10 rounded-full bg-muted-foreground/30"
        />
        <p className="px-4 pt-1.5 pb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          {title}
        </p>
        <ul className="max-h-[70dvh] overflow-y-auto px-2 pb-1">
          {items.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onSelect(item.key)}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-base transition-colors active:bg-accent",
                  item.danger ? "text-destructive" : "text-foreground",
                )}
              >
                {item.icon ? (
                  <span className="grid size-5 shrink-0 place-items-center">
                    {item.icon}
                  </span>
                ) : null}
                <span className="min-w-0 truncate">{item.label}</span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-base text-muted-foreground transition-colors active:bg-accent"
            >
              <span className="grid size-5 shrink-0 place-items-center">
                <X className="size-4" aria-hidden />
              </span>
              Cancel
            </button>
          </li>
        </ul>
      </DrawerContent>
    </Drawer>
  );
}
