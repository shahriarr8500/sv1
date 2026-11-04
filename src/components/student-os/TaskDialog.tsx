/**
 * Task dialog — one form for creating and editing a personal task.
 *
 * Create mode asks for the minimum (a title) and defaults everything else to
 * something sensible, so a task can be added in seconds; every field is still
 * there for students who want a due time, a category or a repeat rule.
 *
 * Edit mode adds the choice that keeps a repeat honest: apply the change to
 * *this occurrence only*, or to *this and every future occurrence*. Changing
 * the schedule itself always means the future — a date or repeat rule is a
 * property of the series, never of one day — so the option narrows itself and
 * says why instead of silently discarding the edit. Deleting asks for a
 * confirmation that spells out exactly which days will go.
 */

import { useEffect, useState } from "react";
import { ListTodo, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  DEFAULT_CATEGORY,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  describeRepeat,
  formatDateKey,
  isPresetCategory,
  todayKey,
  validateTaskDraft,
  type TaskPriority,
  type TaskRepeat,
} from "@/lib/student-os/daily-tasks";
import { useDailyTasks, type DayTask } from "@/state/daily-tasks";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5];

const REPEAT_OPTIONS: ReadonlyArray<{ id: TaskRepeat; label: string }> = [
  { id: "none", label: "Does not repeat" },
  { id: "daily", label: "Every day" },
  { id: "weekdays", label: "Selected weekdays" },
  { id: "weekly", label: "Weekly" },
];

function sameWeekdays(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort((x, y) => x - y);
  const right = [...b].sort((x, y) => x - y);
  return left.every((value, index) => value === right[index]);
}

export function TaskDialog({
  open,
  onOpenChange,
  task,
  defaultDate,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The task being edited; null = create mode. */
  task?: DayTask | null;
  /** Date the form starts on (the day the student is looking at). */
  defaultDate?: string;
  /** Fired after a successful save or delete. */
  onSaved?: () => void;
}) {
  const { createTask, updateTask, deleteTask, getSeries } = useDailyTasks();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(defaultDate ?? todayKey());
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [category, setCategory] = useState<string>(DEFAULT_CATEGORY);
  const [repeat, setRepeat] = useState<TaskRepeat>("none");
  const [weekdays, setWeekdays] = useState<number[]>(DEFAULT_WEEKDAYS);
  const [dueTime, setDueTime] = useState("");
  const [scope, setScope] = useState<"occurrence" | "future">("future");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Re-seed the form every time the dialog opens on a (possibly different) task.
  useEffect(() => {
    if (!open) return;
    const series = task ? getSeries(task.taskId) : undefined;
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setDate(task?.date ?? defaultDate ?? todayKey());
    setPriority(task?.priority ?? "medium");
    setCategory(series?.category ?? task?.category ?? DEFAULT_CATEGORY);
    setRepeat(series?.repeat ?? "none");
    setWeekdays(series?.weekdays ?? DEFAULT_WEEKDAYS);
    setDueTime(task?.dueTime ?? "");
    setScope(series && series.repeat !== "none" ? "future" : "future");
    setError(null);
    setSaving(false);
    setConfirmingDelete(false);
  }, [open, task, defaultDate, getSeries]);

  const editing = Boolean(task);
  const originalSeries = task ? getSeries(task.taskId) : undefined;
  const originalRepeat = originalSeries?.repeat ?? "none";
  const originalDate = originalSeries?.startDate ?? task?.date ?? date;
  const originalWeekdays = originalSeries?.weekdays ?? DEFAULT_WEEKDAYS;

  // The schedule lives on the series, so changing it can never be a
  // one-occurrence edit — say so rather than dropping the change on the floor.
  const scheduleChanged =
    editing &&
    (date !== originalDate ||
      repeat !== originalRepeat ||
      (repeat === "weekdays" && !sameWeekdays(weekdays, originalWeekdays)));
  const effectiveScope: "occurrence" | "future" =
    scheduleChanged || !editing ? "future" : scope;

  const scheduleHint = originalSeries
    ? `${describeRepeat(originalSeries)} · from ${formatDateKey(originalSeries.startDate)}`
    : null;

  const toggleWeekday = (day: number) => {
    setWeekdays((previous) =>
      previous.includes(day)
        ? previous.filter((value) => value !== day)
        : [...previous, day].sort((a, b) => a - b),
    );
  };

  const handleSave = async () => {
    const validated = validateTaskDraft({
      title,
      description: description.trim() || undefined,
      date,
      priority,
      category,
      repeat,
      weekdays,
      dueTime: dueTime || undefined,
    });
    if (!validated.ok) {
      setError(validated.error);
      return;
    }
    const value = validated.value;

    setSaving(true);
    setError(null);
    try {
      if (task) {
        const patch: Parameters<typeof updateTask>[0]["patch"] = {
          title: value.title,
          description: value.description ?? null,
          priority: value.priority,
          category: value.category,
          dueTime: value.dueTime ?? null,
        };
        if (scheduleChanged) {
          patch.date = value.date;
          patch.repeat = value.repeat;
          patch.weekdays = value.weekdays ?? null;
        }
        await updateTask({
          taskId: task.taskId,
          scope: effectiveScope,
          date: task.date,
          patch,
        });
      } else {
        await createTask(value);
      }
      onSaved?.();
      onOpenChange(false);
    } catch {
      // The provider already reported the exact reason with a toast.
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    setSaving(true);
    try {
      await deleteTask({ taskId: task.taskId, scope: effectiveScope, date: task.date });
      onSaved?.();
      onOpenChange(false);
    } catch {
      // Reported by the provider.
    } finally {
      setSaving(false);
    }
  };

  const deleteScopeLabel =
    effectiveScope === "occurrence"
      ? `just ${formatDateKey(task?.date ?? date)}`
      : originalRepeat === "none"
        ? "this task"
        : "this task and every occurrence from here on";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setConfirmingDelete(false);
      }}
    >
      <DialogContent className="flex max-h-[90vh] flex-col gap-4 p-0 sm:max-w-lg">
        <DialogHeader className="border-b px-5 pt-5 pb-4 sm:px-6">
          <DialogTitle className="flex items-center gap-2">
            <ListTodo className="size-4 text-primary" aria-hidden />
            {editing ? "Edit task" : "New task"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Changes can apply to this day alone or to every future day of this task."
              : "A title is all it takes — add a date, priority or repeat whenever you want."}
          </DialogDescription>
        </DialogHeader>

        {confirmingDelete ? (
          <div className="space-y-4 px-5 py-2 sm:px-6">
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
              <p className="text-sm font-semibold">Delete this task?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                This removes {deleteScopeLabel}. Days already in the past keep
                their record, and this can&apos;t be undone.
              </p>
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
            <div className="space-y-1.5">
              <Label htmlFor="task-title">Title</Label>
              <Input
                id="task-title"
                value={title}
                autoFocus
                placeholder="Revise organic chemistry"
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task-description">Description</Label>
              <Textarea
                id="task-description"
                value={description}
                rows={2}
                placeholder="Optional — notes for future you"
                maxLength={2000}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="task-date">Date</Label>
                <Input
                  id="task-date"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-time">Due time</Label>
                <Input
                  id="task-time"
                  type="time"
                  value={dueTime}
                  onChange={(event) => setDueTime(event.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="task-priority">Priority</Label>
                <Select
                  value={priority}
                  onValueChange={(value) => setPriority(value as TaskPriority)}
                >
                  <SelectTrigger id="task-priority" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_PRIORITIES.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        {entry.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="task-category">Category</Label>
                <Select
                  value={isPresetCategory(category) ? category : "custom"}
                  onValueChange={(value) =>
                    setCategory(value === "custom" ? "" : value)
                  }
                >
                  <SelectTrigger id="task-category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_CATEGORIES.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        {entry.label}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">Custom…</SelectItem>
                  </SelectContent>
                </Select>
                {!isPresetCategory(category) ? (
                  <Input
                    value={category}
                    placeholder="Name your category"
                    maxLength={40}
                    className="mt-1.5"
                    aria-label="Custom category"
                    onChange={(event) => setCategory(event.target.value)}
                  />
                ) : null}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task-repeat">Repeat</Label>
              <Select
                value={repeat}
                onValueChange={(value) => setRepeat(value as TaskRepeat)}
              >
                <SelectTrigger id="task-repeat" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPEAT_OPTIONS.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {scheduleHint ? (
                <p className="text-xs text-muted-foreground">{scheduleHint}</p>
              ) : null}
            </div>

            {repeat === "weekdays" ? (
              <div className="space-y-1.5">
                <Label>Weekdays</Label>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAY_LABELS.map((label, day) => (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={weekdays.includes(day)}
                      aria-label={WEEKDAY_NAMES[day]}
                      className={cn(
                        "size-9 cursor-pointer rounded-full border text-xs font-medium transition-colors",
                        weekdays.includes(day)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
                      )}
                      onClick={() => toggleWeekday(day)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {editing && originalRepeat !== "none" ? (
              <div className="space-y-1.5">
                <Label>Apply to</Label>
                <div className="grid gap-1.5">
                  <ScopeOption
                    selected={effectiveScope === "occurrence"}
                    disabled={scheduleChanged}
                    label="Only this occurrence"
                    hint={formatDateKey(task?.date ?? date)}
                    onSelect={() => setScope("occurrence")}
                  />
                  <ScopeOption
                    selected={effectiveScope === "future"}
                    label="This and future occurrences"
                    hint={
                      scheduleChanged
                        ? "schedule changes apply here"
                        : `from ${formatDateKey(task?.date ?? date)} on`
                    }
                    onSelect={() => setScope("future")}
                  />
                </div>
                {scheduleChanged ? (
                  <p className="text-xs text-muted-foreground">
                    A new date or repeat rule always applies from this day
                    onwards — earlier days keep their history.
                  </p>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter className="border-t px-5 py-4 sm:px-6">
          {confirmingDelete ? (
            <>
              <Button
                variant="ghost"
                className="cursor-pointer"
                disabled={saving}
                onClick={() => setConfirmingDelete(false)}
              >
                Keep task
              </Button>
              <Button
                variant="destructive"
                className="cursor-pointer"
                disabled={saving}
                onClick={() => void handleDelete()}
              >
                <Trash2 className="size-4" aria-hidden />
                Delete
              </Button>
            </>
          ) : (
            <>
              {editing ? (
                <Button
                  variant="ghost"
                  className="mr-auto cursor-pointer text-destructive hover:text-destructive"
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Delete
                </Button>
              ) : null}
              <Button
                variant="ghost"
                className="cursor-pointer"
                disabled={saving}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                className="cursor-pointer"
                disabled={saving}
                onClick={() => void handleSave()}
              >
                {saving ? "Saving…" : editing ? "Save changes" : "Add task"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One "apply to" choice, styled as a selectable row. */
function ScopeOption({
  selected,
  disabled,
  label,
  hint,
  onSelect,
}: {
  selected: boolean;
  disabled?: boolean;
  label: string;
  hint: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
        selected ? "border-primary bg-primary/5" : "hover:bg-accent/50",
        disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
      )}
      onClick={onSelect}
    >
      <span
        className={cn(
          "flex size-3.5 shrink-0 items-center justify-center rounded-full border",
          selected ? "border-primary" : "border-muted-foreground",
        )}
      >
        {selected ? (
          <span className="size-2 rounded-full bg-primary" aria-hidden />
        ) : null}
      </span>
      <span className="min-w-0 flex-1 font-medium">{label}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{hint}</span>
    </button>
  );
}
