/**
 * My Daily Tasks — the personal to-do list for one date.
 *
 * Rows are occurrence records, not the series: ticking one completes *that*
 * day only, and a repeating task shows up again tomorrow unticked. Pending
 * work is listed first (highest priority first); anything finished moves into
 * the day's completed list, where it stays visible instead of vanishing — the
 * day's history is the point.
 *
 * Deleting always goes through a confirmation that names the scope, because a
 * repeated task can lose far more than one row.
 */

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock,
  ListTodo,
  Pencil,
  Plus,
  Repeat2,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  categoryLabel,
  describeRepeat,
  formatDateKey,
  priorityLabel,
  type TaskPriority,
} from "@/lib/student-os/daily-tasks";
import { cn } from "@/lib/utils";
import { useDailyTasks, type DayTask } from "@/state/daily-tasks";
import { TaskDialog } from "@/components/student-os/TaskDialog";

const PRIORITY_DOT: Record<TaskPriority, string> = {
  high: "bg-destructive",
  medium: "bg-amber-500",
  low: "bg-sky-500",
};

/** "17:40" → "5:40 PM" — a due time students actually recognise. */
function formatTime(value: string): string {
  const [hoursRaw, minutes] = value.split(":");
  const hours = Number(hoursRaw);
  if (!Number.isFinite(hours) || minutes === undefined) return value;
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutes} ${suffix}`;
}

export function MyDailyTasks({
  dateKey,
  variant = "section",
}: {
  dateKey: string;
  /** `card` = standalone card, `section` = a block inside another card. */
  variant?: "card" | "section";
}) {
  const { forDate, loading, setCompleted, getSeries, deleteTask } =
    useDailyTasks();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DayTask | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DayTask | null>(null);
  const [deleting, setDeleting] = useState(false);

  const rows = forDate(dateKey);
  const pending = useMemo(
    () => rows.filter((row) => !row.completed),
    [rows],
  );
  const completed = useMemo(
    () => rows.filter((row) => row.completed),
    [rows],
  );

  const handleToggle = (task: DayTask, next: boolean) => {
    if (task.completed === next) return;
    void setCompleted(task.taskId, task.date, next).catch(() => {
      // Already reported with a toast; the overlay rolls back on its own.
    });
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const series = getSeries(pendingDelete.taskId);
      const scope =
        series && series.repeat !== "none" ? "future" : "occurrence";
      await deleteTask({
        taskId: pendingDelete.taskId,
        scope,
        date: pendingDelete.date,
      });
      setPendingDelete(null);
    } catch {
      // Reported by the provider — keep the dialog open so nothing is lost.
    } finally {
      setDeleting(false);
    }
  };

  const list = (
    <div className="space-y-3">
      {loading && rows.length === 0 ? (
        <div className="space-y-2" aria-hidden>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed px-6 py-8 text-center">
          <p className="flex items-center justify-center gap-2 text-sm font-semibold">
            <ListTodo className="size-4 text-primary" aria-hidden />
            Nothing on your list
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Add a personal task for {formatDateKey(dateKey)} — study plans,
            chores, workouts, anything that isn&apos;t a syllabus mission.
          </p>
          <Button
            className="mt-4 cursor-pointer"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="size-4" aria-hidden />
            Add task
          </Button>
        </div>
      ) : (
        <>
          {pending.length > 0 ? (
            <ul className="space-y-1.5">
              {pending.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={handleToggle}
                  onEdit={() => {
                    setEditing(task);
                    setDialogOpen(true);
                  }}
                  onDelete={() => setPendingDelete(task)}
                />
              ))}
            </ul>
          ) : null}

          {completed.length > 0 ? (
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                <CheckCircle2 className="size-3.5 text-primary" aria-hidden />
                Completed ({completed.length})
              </p>
              <ul className="space-y-1.5">
                {completed.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onToggle={handleToggle}
                    onEdit={() => {
                      setEditing(task);
                      setDialogOpen(true);
                    }}
                    onDelete={() => setPendingDelete(task)}
                  />
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </div>
  );

  const addButton = (
    <Button
      size="sm"
      className="cursor-pointer"
      onClick={() => {
        setEditing(null);
        setDialogOpen(true);
      }}
    >
      <Plus className="size-4" aria-hidden />
      Add task
    </Button>
  );

  const dialog = (
    <>
      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editing}
        defaultDate={dateKey}
      />
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `“${pendingDelete.title}” will be removed${
                    getSeries(pendingDelete.taskId)?.repeat !== "none"
                      ? " along with every future occurrence"
                      : ""
                }. Days already completed keep their record. This can't be undone.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              {deleting ? "Deleting…" : "Delete task"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (variant === "card") {
    return (
      <Card className="gap-4">
        <CardHeader className="gap-3">
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ListTodo className="size-4 text-primary" aria-hidden />
              My Daily Tasks
              {rows.length > 0 ? (
                <span className="text-sm font-normal text-muted-foreground tabular-nums">
                  {completed.length}/{rows.length} done
                </span>
              ) : null}
            </CardTitle>
            {addButton}
          </div>
        </CardHeader>
        <CardContent className="pt-0">{list}</CardContent>
        {dialog}
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold tracking-wide">
          <ListTodo className="size-4 text-primary" aria-hidden />
          My Daily Tasks
          {rows.length > 0 ? (
            <span className="font-normal text-muted-foreground tabular-nums">
              {completed.length}/{rows.length} done
            </span>
          ) : null}
        </h3>
        {addButton}
      </div>
      {list}
      {dialog}
    </div>
  );
}

function TaskRow({
  task,
  onToggle,
  onEdit,
  onDelete,
}: {
  task: DayTask;
  onToggle: (task: DayTask, next: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { getSeries } = useDailyTasks();
  const series = getSeries(task.taskId);
  const repeats = Boolean(series && series.repeat !== "none");

  return (
    <li
      className={cn(
        "group flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors",
        task.completed
          ? "border-primary/25 bg-primary/[0.04]"
          : "hover:border-primary/30 hover:bg-accent/40",
      )}
    >
      <Checkbox
        className="mt-1"
        checked={task.completed}
        aria-label={
          task.completed
            ? `Mark ${task.title} incomplete`
            : `Mark ${task.title} complete`
        }
        onCheckedChange={(state) => onToggle(task, state === true)}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={cn(
              "min-w-0 text-sm font-medium tracking-tight break-words",
              task.completed && "text-muted-foreground line-through",
            )}
          >
            {task.title}
          </span>
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              PRIORITY_DOT[task.priority],
            )}
            title={`${priorityLabel(task.priority)} priority`}
            aria-label={`${priorityLabel(task.priority)} priority`}
          />
        </div>

        {task.description && !task.completed ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {task.description}
          </p>
        ) : null}

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium">{categoryLabel(task.category)}</span>
          {task.dueTime ? (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Clock className="size-3" aria-hidden />
              {formatTime(task.dueTime)}
            </span>
          ) : null}
          {repeats && series ? (
            <span className="inline-flex items-center gap-1">
              <Repeat2 className="size-3" aria-hidden />
              {describeRepeat(series)}
            </span>
          ) : null}
          {task.completed && task.completedAt ? (
            <span className="text-primary">Done</span>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="icon-sm"
          variant="ghost"
          className="h-7 w-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          aria-label={`Edit ${task.title}`}
          title="Edit task"
          onClick={onEdit}
        >
          <Pencil className="size-3.5" aria-hidden />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          className="h-7 w-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          aria-label={`Delete ${task.title}`}
          title="Delete task"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" aria-hidden />
        </Button>
      </div>
    </li>
  );
}
