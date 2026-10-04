import logo from "@/assets/logo.svg";
import {
  ChoiceSelect,
  ExampleChips,
  SubjectPicker,
} from "@/components/student-os/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CURRICULUM_OPTIONS,
  EDUCATION_LEVEL_OPTIONS,
  EXAM_EXAMPLES,
  GOAL_PLACEHOLDER,
  TARGET_EXAMPLES,
} from "@/lib/student-os/options";
import { PCMB_SUBJECT_IDS, SYLLABUS } from "@/lib/student-os/syllabus";
import { useStudentOS } from "@/state/student-os";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate } from "react-router";

type Step =
  | "welcome"
  | "goal"
  | "target"
  | "exam"
  | "education"
  | "curriculum"
  | "subjects"
  | "summary";

const STEPS: Step[] = [
  "welcome",
  "goal",
  "target",
  "exam",
  "education",
  "curriculum",
  "subjects",
  "summary",
];

/** Steps after the welcome screen — drives the "Step X of 7" indicator. */
const NUMBERED_STEP_COUNT = STEPS.length - 1;

export default function OnboardingPage() {
  const { profile, saveProfile } = useStudentOS();
  const navigate = useNavigate();

  const [stepIndex, setStepIndex] = useState(0);
  const [goal, setGoal] = useState("");
  const [target, setTarget] = useState("");
  const [exam, setExam] = useState("");
  const [educationLevel, setEducationLevel] = useState("");
  const [curriculum, setCurriculum] = useState("");
  const [subjects, setSubjects] = useState<string[]>([...PCMB_SUBJECT_IDS]);
  const [error, setError] = useState<string | null>(null);

  const step = STEPS[stepIndex];

  // Already onboarded — straight to the dashboard.
  if (profile) return <Navigate to="/dashboard" replace />;

  const validate = (which: Step): string | null => {
    switch (which) {
      case "goal":
        return goal.trim() ? null : "Please enter your main goal.";
      case "target":
        return target.trim()
          ? null
          : "Please tell us what you want to achieve.";
      case "exam":
        return exam.trim()
          ? null
          : "Please enter the exam or admission you're preparing for.";
      case "education":
        return educationLevel.trim()
          ? null
          : "Choose your current class or level — or pick Other and type it in.";
      case "curriculum":
        return curriculum.trim()
          ? null
          : "Choose your curriculum — or pick Other and type it in.";
      case "subjects":
        return subjects.length > 0
          ? null
          : "Select at least one subject to track.";
      default:
        return null;
    }
  };

  const goNext = () => {
    const problem = validate(step);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setStepIndex((index) => Math.min(index + 1, STEPS.length - 1));
  };

  const goBack = () => {
    setError(null);
    setStepIndex((index) => Math.max(index - 1, 0));
  };

  const finish = () => {
    const problem =
      validate("goal") ??
      validate("target") ??
      validate("exam") ??
      validate("education") ??
      validate("curriculum") ??
      validate("subjects");
    if (problem) {
      setError(problem);
      return;
    }
    saveProfile({
      goal: goal.trim(),
      target: target.trim(),
      exam: exam.trim(),
      educationLevel,
      curriculum,
      subjects,
    });
    navigate("/dashboard", { replace: true });
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (step === "summary") finish();
    else goNext();
  };

  const textStep = ({
    question,
    hint,
    placeholder,
    value,
    onChange,
    examples,
    examplesLabel,
  }: {
    question: string;
    hint: string;
    placeholder: string;
    value: string;
    onChange: (value: string) => void;
    examples?: string[];
    examplesLabel?: string;
  }): ReactNode => (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {question}
        </h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      <Input
        autoFocus
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        aria-label={question}
        className="h-12 text-base"
        onChange={(event) => onChange(event.target.value)}
      />
      {examples ? (
        <div className="space-y-2.5">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            {examplesLabel ?? "Examples"}
          </p>
          <ExampleChips values={examples} onPick={onChange} />
        </div>
      ) : null}
    </div>
  );

  const choiceStep = ({
    question,
    hint,
    options,
    value,
    onChange,
    customPlaceholder,
  }: {
    question: string;
    hint: string;
    options: string[];
    value: string;
    onChange: (value: string) => void;
    customPlaceholder: string;
  }): ReactNode => (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {question}
        </h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      <ChoiceSelect
        options={options}
        initialValue={value}
        onChange={onChange}
        customPlaceholder={customPlaceholder}
        ariaLabel={question}
      />
    </div>
  );

  const summaryRow = (label: string, value: string) => (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-semibold tracking-tight">
        {value}
      </dd>
    </div>
  );

  const renderStep = (): ReactNode => {
    switch (step) {
      case "welcome":
        return (
          <div className="flex flex-col items-center py-6 text-center">
            <img
              src={logo}
              alt=""
              width={64}
              height={64}
              className="rounded-2xl"
            />
            <h1 className="mt-7 text-3xl font-bold tracking-tight sm:text-4xl">
              Welcome to Student OS
            </h1>
            <p className="mt-3 max-w-md text-base text-muted-foreground">
              Build your path. Track your progress. Become who you want to be.
            </p>
            <Button
              size="lg"
              className="mt-9 cursor-pointer"
              onClick={goNext}
            >
              Let&apos;s Begin
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
        );
      case "goal":
        return textStep({
          question: "What is your main goal?",
          hint: "The one achievement everything else is organized around.",
          placeholder: GOAL_PLACEHOLDER,
          value: goal,
          onChange: setGoal,
        });
      case "target":
        return textStep({
          question: "What do you want to achieve?",
          hint: "Your concrete outcome. Anything works — these are just ideas.",
          placeholder: "e.g. 1st Position, Top 10, Get A+...",
          value: target,
          onChange: setTarget,
          examples: TARGET_EXAMPLES,
        });
      case "exam":
        return textStep({
          question: "What exam or admission process are you preparing for?",
          hint: "The exam your goal is measured through.",
          placeholder: "e.g. BUET Admission, HSC, Medical Admission...",
          value: exam,
          onChange: setExam,
          examples: EXAM_EXAMPLES,
        });
      case "education":
        return choiceStep({
          question: "What is your current class / level?",
          hint: "Pick the closest match — or choose Other and type it yourself.",
          options: EDUCATION_LEVEL_OPTIONS,
          value: educationLevel,
          onChange: setEducationLevel,
          customPlaceholder: "Type your class or level",
        });
      case "curriculum":
        return choiceStep({
          question: "Which curriculum are you following?",
          hint: "This shapes the syllabus data you'll track.",
          options: CURRICULUM_OPTIONS,
          value: curriculum,
          onChange: setCurriculum,
          customPlaceholder: "Type your curriculum",
        });
      case "subjects":
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Which subjects are you currently tracking?
              </h2>
              <p className="text-sm text-muted-foreground">
                All four PCMB 1st Paper subjects are selected by default.
                Adjust the list if you need to.
              </p>
            </div>
            <SubjectPicker selectedIds={subjects} onChange={setSubjects} />
          </div>
        );
      case "summary": {
        const tracked = SYLLABUS.filter((subject) =>
          subjects.includes(subject.id),
        );
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Ready to begin
              </h2>
              <p className="text-sm text-muted-foreground">
                Confirm your setup — you can change any of this later in
                Settings.
              </p>
            </div>
            <dl className="divide-y divide-border rounded-xl border bg-card">
              {summaryRow("Your Goal", goal)}
              {summaryRow("Your Target", target)}
              {summaryRow("Exam", exam)}
              {summaryRow("Education", educationLevel)}
              {summaryRow("Curriculum", curriculum)}
              <div className="px-5 py-4">
                <dt className="text-sm font-medium text-muted-foreground">
                  Subjects
                </dt>
                <dd className="mt-1.5 space-y-1 text-right text-sm font-semibold tracking-tight">
                  {tracked.map((subject) => (
                    <div key={subject.id}>{subject.name}</div>
                  ))}
                </dd>
              </div>
            </dl>
          </div>
        );
      }
      default:
        return null;
    }
  };

  const progressPercent = (stepIndex / NUMBERED_STEP_COUNT) * 100;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-16 w-full max-w-2xl items-center justify-between px-4 sm:px-6">
          <Link
            to="/"
            className="flex cursor-pointer items-center gap-2.5 transition-opacity hover:opacity-80"
          >
            <img src={logo} alt="" width={26} height={26} className="rounded-md" />
            <span className="text-sm font-bold tracking-tight">Student OS</span>
          </Link>
          {stepIndex > 0 ? (
            <span className="text-xs font-medium text-muted-foreground tabular-nums">
              Step {stepIndex} of {NUMBERED_STEP_COUNT}
            </span>
          ) : null}
        </div>
        {stepIndex > 0 ? (
          <div
            className="h-1 w-full bg-muted"
            role="progressbar"
            aria-label="Onboarding progress"
            aria-valuemin={0}
            aria-valuemax={NUMBERED_STEP_COUNT}
            aria-valuenow={stepIndex}
          >
            <motion.div
              className="h-full bg-primary"
              initial={false}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
          </div>
        ) : null}
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-2xl">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {step === "welcome" ? (
                renderStep()
              ) : (
                <form onSubmit={handleSubmit} className="space-y-7">
                  <div className="space-y-6">{renderStep()}</div>

                  {error ? (
                    <p role="alert" className="text-sm font-medium text-destructive">
                      {error}
                    </p>
                  ) : null}

                  <div className="flex items-center justify-between gap-3 border-t pt-6">
                    <Button
                      type="button"
                      variant="ghost"
                      className="cursor-pointer"
                      onClick={goBack}
                    >
                      <ArrowLeft className="size-4" aria-hidden />
                      Back
                    </Button>
                    <Button type="submit" className="cursor-pointer">
                      {step === "summary" ? "Start My Journey" : "Continue"}
                      {step === "summary" ? null : (
                        <ArrowRight className="size-4" aria-hidden />
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
