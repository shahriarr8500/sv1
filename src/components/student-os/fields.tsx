/**
 * Shared form controls for Onboarding and Settings → Goal, so both flows use
 * identical interaction patterns without duplicating markup.
 */

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CUSTOM_OPTION } from "@/lib/student-os/options";
import { SYLLABUS } from "@/lib/student-os/syllabus";
import { cn } from "@/lib/utils";
import { useState, type ReactNode } from "react";

/** Labeled text input used in form-style pages (Settings → Goal). */
export function TextField({
  id,
  label,
  hint,
  placeholder,
  value,
  onChange,
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Suggestion chips — clicking one fills the associated field, free text stays allowed. */
export function ExampleChips({
  values,
  onPick,
}: {
  values: string[];
  onPick: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onPick(value)}
          className="cursor-pointer rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
        >
          {value}
        </button>
      ))}
    </div>
  );
}

/** Single-select option pills with a light-blue selected state. */
export function OptionPills({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = value === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option)}
            className={cn(
              "cursor-pointer rounded-lg border px-3.5 py-2 text-sm transition-colors",
              selected
                ? "border-primary/60 bg-primary/10 font-medium text-primary"
                : "border-border text-foreground hover:border-primary/40 hover:bg-accent",
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Option picker where "Other" reveals a free-text input. `initialValue` seeds
 * the component (for editing an existing profile); every change is reported
 * back through `onChange` as the resolved string.
 */
export function ChoiceSelect({
  options,
  initialValue,
  onChange,
  customPlaceholder,
  ariaLabel,
}: {
  options: string[];
  initialValue: string;
  onChange: (resolvedValue: string) => void;
  customPlaceholder?: string;
  ariaLabel?: string;
}) {
  const startsCustom = initialValue.length > 0 && !options.includes(initialValue);
  const [selected, setSelected] = useState(
    startsCustom ? CUSTOM_OPTION : initialValue,
  );
  const [customText, setCustomText] = useState(startsCustom ? initialValue : "");

  const pick = (option: string) => {
    setSelected(option);
    onChange(option === CUSTOM_OPTION ? customText.trim() : option);
  };

  const typeCustom = (text: string) => {
    setCustomText(text);
    if (selected === CUSTOM_OPTION) onChange(text.trim());
  };

  return (
    <div className="space-y-2">
      <OptionPills
        options={options}
        value={selected}
        onChange={pick}
        ariaLabel={ariaLabel}
      />
      {selected === CUSTOM_OPTION ? (
        <Input
          value={customText}
          placeholder={customPlaceholder}
          autoComplete="off"
          aria-label={customPlaceholder ?? "Type your own option"}
          onChange={(event) => typeCustom(event.target.value)}
          className="max-w-sm"
        />
      ) : null}
    </div>
  );
}

/** Checkbox cards for choosing tracked subjects. */
export function SubjectPicker({
  selectedIds,
  onChange,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {SYLLABUS.filter((subject) => subject.paperKey === "1st").map((subject) => {
        const checkboxId = `subject-option-${subject.id}`;
        const checked = selectedIds.includes(subject.id);
        return (
          <label
            key={subject.id}
            htmlFor={checkboxId}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors",
              checked
                ? "border-primary/50 bg-primary/5"
                : "border-border hover:border-primary/40 hover:bg-accent/60",
            )}
          >
            <Checkbox
              id={checkboxId}
              checked={checked}
              className="mt-0.5"
              onCheckedChange={(state) =>
                onChange(
                  state === true
                    ? [...selectedIds, subject.id]
                    : selectedIds.filter((id) => id !== subject.id),
                )
              }
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold tracking-tight">
                {subject.name}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {subject.paper} · {subject.totalItems} items
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** Simple heading + content block used to pace long forms. */
export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
