import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccountLabel } from "@/hooks/use-account-label";
import { formatPrice } from "@/lib/student-os/catalog";
import type { WorkspaceBooking } from "@/lib/student-os/workspace";
import { cn } from "@/lib/utils";
import { useCatalogItem, useWorkspace } from "@/state/workspace";
import { motion } from "framer-motion";
import { addDays, format } from "date-fns";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Loader2,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router";

const TIME_SLOTS = ["9:00 AM", "10:00 AM", "11:00 AM", "2:00 PM", "4:00 PM", "6:00 PM"];

function SlotPicker({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string | null;
  onPick: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div role="group" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onPick(option.value)}
              className={cn(
                "cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition-colors",
                active
                  ? "border-primary/60 bg-primary/10 font-medium text-primary"
                  : "border-border text-foreground hover:border-primary/40 hover:bg-accent",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Book a time and check out — schedule first (if needed), then payment. */
export default function CheckoutPage() {
  const { itemId } = useParams();
  const item = useCatalogItem(itemId);
  const { createBooking } = useWorkspace();
  const accountLabel = useAccountLabel();

  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [confirmed, setConfirmed] = useState<WorkspaceBooking | null>(null);

  const days = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => {
        const day = addDays(new Date(), index);
        return {
          value: format(day, "yyyy-MM-dd"),
          label: format(day, "EEE d MMM"),
        };
      }),
    [],
  );

  if (!item) return <Navigate to="/catalog" replace />;

  const needsSlot = item.bookable;
  const requiresPayment = item.price > 0;

  const onCardNumber = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 16);
    setCardNumber(digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim());
  };

  const onExpiry = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    setExpiry(digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (processing) return;

    if (needsSlot && (!date || !time)) {
      setError("Choose a date and a time for your session.");
      return;
    }
    if (requiresPayment) {
      if (!cardName.trim()) {
        setError("Enter the name on your card.");
        return;
      }
      if (cardNumber.replace(/\D/g, "").length < 15) {
        setError("Enter a valid card number.");
        return;
      }
      if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry)) {
        setError("Enter the expiry date as MM/YY.");
        return;
      }
      if (!/^\d{3,4}$/.test(cvc)) {
        setError("Enter the 3 or 4 digit security code.");
        return;
      }
    }

    setError(null);
    setProcessing(true);
    // Simulated processing step so checkout reads like the real thing.
    window.setTimeout(() => {
      const booking = createBooking({
        itemId: item.id,
        title: item.title,
        amount: item.price,
        date: needsSlot && date ? date : undefined,
        time: needsSlot && time ? time : undefined,
        customer: requiresPayment ? cardName.trim() : accountLabel,
      });
      setProcessing(false);
      setConfirmed(booking);
    }, 900);
  };

  if (confirmed) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="mx-auto max-w-lg space-y-6 py-6 text-center"
      >
        <span
          aria-hidden
          className="mx-auto grid size-14 place-items-center rounded-full bg-primary/10 text-primary"
        >
          <CheckCircle2 className="size-7" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {item.bookable
              ? "Session booked"
              : item.price > 0
                ? "You're enrolled"
                : "Added to your bookings"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            Everything is confirmed and saved to your account.
          </p>
        </div>

        <div className="rounded-xl border bg-card p-6 text-left">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Item</dt>
              <dd className="text-right font-medium">{confirmed.title}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">When</dt>
              <dd className="text-right font-medium">
                {confirmed.date && confirmed.time
                  ? `${confirmed.date} · ${confirmed.time}`
                  : "Self-paced"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Total</dt>
              <dd className="text-right font-medium">
                {formatPrice(confirmed.amount)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Reference</dt>
              <dd className="text-right font-medium tabular-nums">
                {confirmed.reference}
              </dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <Button className="cursor-pointer" asChild>
            <Link to="/bookings">View my bookings</Link>
          </Button>
          <Button variant="outline" className="cursor-pointer" asChild>
            <Link to="/catalog">Back to catalog</Link>
          </Button>
        </div>
      </motion.div>
    );
  }

  const submitLabel = requiresPayment
    ? `Pay ${formatPrice(item.price)}`
    : needsSlot
      ? "Confirm booking"
      : "Add to my bookings";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mx-auto max-w-2xl space-y-6"
    >
      <Link
        to={`/catalog/${item.id}`}
        className="inline-flex w-fit cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {item.title}
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {needsSlot ? "Book your session" : "Check out"}
        </h1>
        <p className="mt-1.5 text-muted-foreground">
          {needsSlot
            ? "Pick a time that works for you, then complete payment."
            : "Review the details and complete checkout."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Summary */}
        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-base">Order summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="min-w-0 truncate">{item.title}</span>
              <span className="shrink-0 font-medium tabular-nums">
                {formatPrice(item.price)}
              </span>
            </div>
            <div className="flex justify-between gap-4 text-muted-foreground">
              <span>{item.provider}</span>
              <span className="shrink-0">{item.category}</span>
            </div>
            <div className="flex justify-between gap-4 border-t pt-2 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatPrice(item.price)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Schedule */}
        {needsSlot ? (
          <Card className="gap-4">
            <CardHeader>
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
                >
                  <CalendarDays className="size-4" />
                </span>
                <CardTitle className="text-base">Choose a time</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <SlotPicker
                label="Date"
                options={days}
                value={date}
                onPick={setDate}
              />
              <SlotPicker
                label="Time"
                options={TIME_SLOTS.map((slot) => ({
                  value: slot,
                  label: slot,
                }))}
                value={time}
                onPick={setTime}
              />
            </CardContent>
          </Card>
        ) : null}

        {/* Payment */}
        <Card className="gap-4">
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
              >
                <CreditCard className="size-4" />
              </span>
              <CardTitle className="text-base">Payment</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {requiresPayment ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="card-name">Name on card</Label>
                  <Input
                    id="card-name"
                    value={cardName}
                    onChange={(event) => setCardName(event.target.value)}
                    autoComplete="cc-name"
                    placeholder="Your full name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="card-number">Card number</Label>
                  <Input
                    id="card-number"
                    value={cardNumber}
                    onChange={(event) => onCardNumber(event.target.value)}
                    inputMode="numeric"
                    autoComplete="cc-number"
                    placeholder="0000 0000 0000 0000"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="card-expiry">Expiry</Label>
                    <Input
                      id="card-expiry"
                      value={expiry}
                      onChange={(event) => onExpiry(event.target.value)}
                      inputMode="numeric"
                      autoComplete="cc-exp"
                      placeholder="MM/YY"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="card-cvc">Security code</Label>
                    <Input
                      id="card-cvc"
                      value={cvc}
                      onChange={(event) =>
                        setCvc(event.target.value.replace(/\D/g, "").slice(0, 4))
                      }
                      inputMode="numeric"
                      autoComplete="cc-csc"
                      placeholder="123"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  This preview does not process real payments — no charge will
                  be made.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {item.price === 0
                  ? "This item is free — no payment details are needed."
                  : "No payment is due for this item."}
              </p>
            )}
          </CardContent>
        </Card>

        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          size="lg"
          className="w-full cursor-pointer"
          disabled={processing}
        >
          {processing ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Processing...
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </form>
    </motion.div>
  );
}
