/**
 * Reading settings. Every control here is a real preference: typography for
 * the Arabic and the translation, what is shown, and how playback follows the
 * reader. Values are persisted locally, so they survive a refresh.
 */

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  ARABIC_SIZE_RANGE,
  LINE_HEIGHT_RANGE,
  TRANSLATION_SIZE_RANGE,
} from "@/lib/student-os/quran-prefs";
import {
  RECITERS,
  TRANSLATIONS,
  getTranslation,
  reciterName,
} from "@/lib/student-os/quran";
import { cn } from "@/lib/utils";
import {
  resetQuranPrefs,
  updateQuranPrefs,
  useQuranPrefs,
} from "@/state/quran-prefs";
import { quranPlayer, useQuranPlayer } from "@/state/quran-player";

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  display: string;
}) {
  return (
    <div className="space-y-2 py-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground tabular-nums">{display}</p>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        onValueChange={([next]) => onChange(next)}
      />
    </div>
  );
}

export function QuranSettingsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const prefs = useQuranPrefs();
  const player = useQuranPlayer();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Reading settings</SheetTitle>
          <SheetDescription>
            Adjust the text and how the recitation follows your reading.
          </SheetDescription>
        </SheetHeader>

        <div className="divide-y px-4 pb-8">
          <div className="space-y-3 py-4">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">English translation</p>
              <Select
                value={prefs.translation}
                onValueChange={(value) =>
                  updateQuranPrefs({ translation: value })
                }
              >
                <SelectTrigger
                  className="w-full"
                  aria-label="English translation"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRANSLATIONS.map((edition) => (
                    <SelectItem key={edition.id} value={edition.id}>
                      {edition.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Translated by {getTranslation(prefs.translation).translator}.
                The Arabic text never changes.
              </p>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium">Reciter</p>
              <Select
                value={player.reciter}
                onValueChange={(value) => quranPlayer.setReciter(value)}
              >
                <SelectTrigger className="w-full" aria-label="Reciter">
                  <SelectValue>{reciterName(player.reciter)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {RECITERS.map((reciter) => (
                    <SelectItem key={reciter.id} value={reciter.id}>
                      <span className="flex items-baseline gap-2">
                        {reciter.name}
                        <span
                          dir="rtl"
                          lang="ar"
                          className="arabic-name text-xs opacity-60"
                        >
                          {reciter.arabicName}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <SliderRow
              label="Arabic size"
              value={prefs.arabicSize}
              min={ARABIC_SIZE_RANGE.min}
              max={ARABIC_SIZE_RANGE.max}
              step={1}
              display={`${prefs.arabicSize}px`}
              onChange={(value) => updateQuranPrefs({ arabicSize: value })}
            />
            <SliderRow
              label="Translation size"
              value={prefs.translationSize}
              min={TRANSLATION_SIZE_RANGE.min}
              max={TRANSLATION_SIZE_RANGE.max}
              step={1}
              display={`${prefs.translationSize}px`}
              onChange={(value) => updateQuranPrefs({ translationSize: value })}
            />
            <SliderRow
              label="Arabic line spacing"
              value={prefs.lineHeight}
              min={LINE_HEIGHT_RANGE.min}
              max={LINE_HEIGHT_RANGE.max}
              step={0.05}
              display={prefs.lineHeight.toFixed(2)}
              onChange={(value) => updateQuranPrefs({ lineHeight: value })}
            />
          </div>

          <div className="py-3">
            <p className="mb-2 text-sm font-medium">Reading layout</p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: "comfortable", label: "Comfortable" },
                  { id: "compact", label: "Compact" },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => updateQuranPrefs({ layout: option.id })}
                  aria-pressed={prefs.layout === option.id}
                  className={cn(
                    "cursor-pointer rounded-lg border px-3 py-2 text-sm transition-colors",
                    prefs.layout === option.id
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <Row label="Show translation" hint="Hide English to read Arabic only">
            <Switch
              checked={prefs.showTranslation}
              aria-label="Show translation"
              onCheckedChange={(checked) =>
                updateQuranPrefs({ showTranslation: checked })
              }
            />
          </Row>
          <Row
            label="Show transliteration"
            hint="Latin letters beside each Ayah"
          >
            <Switch
              checked={prefs.showTransliteration}
              aria-label="Show transliteration"
              onCheckedChange={(checked) =>
                updateQuranPrefs({ showTransliteration: checked })
              }
            />
          </Row>
          <Row
            label="Follow the recitation"
            hint="Scroll to the Ayah being played"
          >
            <Switch
              checked={prefs.autoScroll}
              aria-label="Auto-scroll during playback"
              onCheckedChange={(checked) =>
                updateQuranPrefs({ autoScroll: checked })
              }
            />
          </Row>
          <Row
            label="Highlight the playing Ayah"
            hint="Blue accent on the active Ayah"
          >
            <Switch
              checked={prefs.highlightAyah}
              aria-label="Highlight the playing Ayah"
              onCheckedChange={(checked) =>
                updateQuranPrefs({ highlightAyah: checked })
              }
            />
          </Row>

          <div className="flex items-center justify-between pt-4">
            <p className="max-w-[60%] text-[11px] leading-relaxed text-muted-foreground">
              Arabic: Tanzil Uthmani text. Translation and per-Ayah audio via
              the AlQuran Cloud and Islamic Network APIs.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 cursor-pointer"
              onClick={() => resetQuranPrefs()}
            >
              <RotateCcw className="size-3.5" aria-hidden />
              Reset
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
