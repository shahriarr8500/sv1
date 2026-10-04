import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatRelativeDay } from "@/lib/student-os/format";
import { SEED_CATALOG, formatPrice } from "@/lib/student-os/catalog";
import { cn } from "@/lib/utils";
import { useBookings, useCatalogItems, useWorkspace } from "@/state/workspace";
import { motion } from "framer-motion";
import { Plus, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";

function StatusChip({ status }: { status: "confirmed" | "cancelled" }) {
  return (
    <span
      className={cn(
        "rounded-lg px-2 py-0.5 text-[11px] font-medium",
        status === "confirmed"
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground",
      )}
    >
      {status === "confirmed" ? "Confirmed" : "Cancelled"}
    </span>
  );
}

/** Admin area — manage the catalog, comments, and bookings customers see. */
export default function AdminPage() {
  const items = useCatalogItems();
  const bookings = useBookings();
  const { workspace, removeItem, restoreItem, deleteComment, setBookingStatus } =
    useWorkspace();

  const removedItems = SEED_CATALOG.filter((seed) =>
    workspace.removedItemIds.includes(seed.id),
  );
  const titleById = new Map(
    [...SEED_CATALOG, ...workspace.posts].map((item) => [item.id, item.title]),
  );
  const confirmedBookings = bookings.filter(
    (booking) => booking.status === "confirmed",
  );
  const revenue = confirmedBookings.reduce(
    (sum, booking) => sum + booking.amount,
    0,
  );

  const stats = [
    { label: "Catalog items", value: String(items.length) },
    { label: "Comments", value: String(workspace.comments.length) },
    { label: "Confirmed bookings", value: String(confirmedBookings.length) },
    { label: "Revenue", value: `৳${revenue.toLocaleString("en-US")}` },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="space-y-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Admin area
          </h1>
          <p className="mt-1.5 text-muted-foreground">
            Manage the catalog, comments, and bookings your customers see.
          </p>
        </div>
        <Button className="cursor-pointer" asChild>
          <Link to="/catalog/new">
            <Plus className="size-4" aria-hidden />
            Add catalog item
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border bg-card p-4">
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              {stat.label}
            </p>
            <p className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="catalog">
        <TabsList>
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
          <TabsTrigger value="comments">
            Comments ({workspace.comments.length})
          </TabsTrigger>
          <TabsTrigger value="bookings">
            Bookings ({bookings.length})
          </TabsTrigger>
        </TabsList>

        {/* Catalog */}
        <TabsContent value="catalog" className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold tracking-tight">
                    {item.title}
                  </p>
                  <span className="rounded-lg border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {item.category}
                  </span>
                  <span
                    className={cn(
                      "text-[11px] font-medium",
                      item.source === "user"
                        ? "text-primary"
                        : "text-muted-foreground",
                    )}
                  >
                    {item.source === "user" ? "Posted" : "Official"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatPrice(item.price)} ·{" "}
                  {item.bookable ? "Bookable session" : "No scheduling"}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer"
                onClick={() => {
                  removeItem(item.id);
                  toast("Removed from the catalog", {
                    description: "Customers can no longer see this item.",
                  });
                }}
              >
                <Trash2 className="size-3.5" aria-hidden />
                Remove
              </Button>
            </div>
          ))}

          {removedItems.length > 0 ? (
            <div className="space-y-2 pt-4">
              <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                Removed
              </p>
              {removedItems.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed p-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-muted-foreground">
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {item.category} · {formatPrice(item.price)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => {
                      restoreItem(item.id);
                      toast("Item restored", {
                        description: "It is visible in the catalog again.",
                      });
                    }}
                  >
                    <RotateCcw className="size-3.5" aria-hidden />
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </TabsContent>

        {/* Comments */}
        <TabsContent value="comments" className="space-y-2">
          {workspace.comments.length === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center">
              <p className="text-sm font-semibold tracking-tight">
                No comments yet
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Comments posted on catalog items will appear here for
                moderation.
              </p>
            </div>
          ) : (
            [...workspace.comments]
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((comment) => (
                <div
                  key={comment.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">
                      {titleById.get(comment.itemId) ?? "Removed item"} ·{" "}
                      {comment.author} · {formatRelativeDay(comment.createdAt)}
                    </p>
                    <p className="mt-1 text-sm break-words">{comment.body}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => {
                      deleteComment(comment.id);
                      toast("Comment deleted");
                    }}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    Delete
                  </Button>
                </div>
              ))
          )}
        </TabsContent>

        {/* Bookings */}
        <TabsContent value="bookings" className="space-y-2">
          {bookings.length === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center">
              <p className="text-sm font-semibold tracking-tight">
                No bookings yet
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Sessions and enrollments created at checkout will appear here.
              </p>
            </div>
          ) : (
            bookings.map((booking) => (
              <div
                key={booking.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold tracking-tight">
                      {booking.title}
                    </p>
                    <StatusChip status={booking.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {booking.customer} ·{" "}
                    {booking.date && booking.time
                      ? `${booking.date} · ${booking.time}`
                      : "Self-paced"}{" "}
                    · {booking.reference}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums">
                    {formatPrice(booking.amount)}
                  </span>
                  {booking.status === "confirmed" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="cursor-pointer"
                      onClick={() => {
                        setBookingStatus(booking.id, "cancelled");
                        toast("Booking cancelled");
                      }}
                    >
                      Cancel
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="cursor-pointer"
                      onClick={() => {
                        setBookingStatus(booking.id, "confirmed");
                        toast("Booking reconfirmed");
                      }}
                    >
                      Reconfirm
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>

      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <p>
          Everything in this area is stored on this device with the rest of
          your Student OS data.
        </p>
      </div>
    </motion.div>
  );
}
