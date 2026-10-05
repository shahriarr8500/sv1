import { cn } from "@/lib/utils";

/**
 * Student OS mark — a bear framed by a triangle.
 *
 * Drawn inline rather than loaded as an image file so it inherits the
 * surrounding text colour and stays legible on both the light and dark
 * surfaces instead of washing out against one of them.
 */
export function StudentOsLogo({
  className,
  strokeWidth = 14,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 480 400"
      role="img"
      aria-label="Student OS"
      className={cn("text-foreground", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Triangle frame */}
      <path d="M240 14 L470 380 Q476 392 462 392 H18 Q4 392 10 380 Z" />
      {/* Bear ears */}
      <circle cx="188" cy="163" r="30" />
      <circle cx="292" cy="163" r="30" />
      {/* Bear head and shoulders */}
      <path d="M188 163a30 30 0 0 1 104 0c0 40-8 62-8 84 0 46 28 96 62 145H134c34-49 62-99 62-145 0-22-8-44-8-84Z" />
    </svg>
  );
}