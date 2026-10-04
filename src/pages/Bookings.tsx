import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/student-os/catalog";
import { cn } from "@/lib/utils";
import { useBookings, useWorkspace } from "@/state/workspace";
import { motion } from "framer-motion";
import { CalendarCheck, CalendarPlus } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";

/** My bookings — every session booked and item enrolled in. */
export default function BookingsPage() {
  const bookings = useBookings();
  const { setBookingStatus } = useWorkspace();

  const cancel = (bookingId: string) => {
    setBookingStatus(bookingId, "cancelled");
    toast("Booking cancelled", {
      description: "You can book the session again from the catalog.",
    });
  };

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
            My bookings
          </h1>
          <p className="mt-1.5 text-muted-foreground">
            Sessions you&apos;ve scheduled and items you&apos;ve enrolled in.
          </p>
        </div>
        <Button variant="outline" className="cursor-pointer" asChild>
          <Link to="/catalog">
            <CalendarPlus className="size-4" aria-hidden />
            Browse catalog
          </Link>
        </Button>
      </div>

      {bookings.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <span
            aria-hidden
            className="mx-auto grid size-11 place-items-center rounded-full bg-primary/10 text-primary"
          >
            <CalendarCheck className="size-5" />
          </span>
          <p className="mt-4 text-sm font-semibold tracking-tight">
            No bookings yet
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            When you book a session or enroll in something from the catalog, it
            will appear here with all of its details.
          </p>
          <Button className="mt-4 cursor-pointer" asChild>
            <Link to="/catalog">Explore the catalog</Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {bookings.map((booking) => (
            <li
              key={booking.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-lg px-2 py-0.5 text-[11px] font-medium",
                      booking.status === "confirmed"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {booking.status === "confirmed" ? "Confirmed" : "Cancelled"}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {booking.reference}
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-semibold tracking-tight">
                  {booking.title}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {booking.date && booking.time
                    ? `${booking.date} · ${booking.time}`
                    : "Self-paced"}
                </p>
              </div>

              <div className="flex items-center gap-4">
                <span className="text-sm font-semibold tabular-nums">
                  {formatPrice(booking.amount)}
                </span>
                {booking.status === "confirmed" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => cancel(booking.id)}
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}
