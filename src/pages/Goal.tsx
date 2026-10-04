import {
  ExampleChips,
  FormSection,
  ChoiceSelect,
  SubjectPicker,
  TextField,
} from "@/components/student-os/fields";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  CURRICULUM_OPTIONS,
  EDUCATION_LEVEL_OPTIONS,
  EXAM_EXAMPLES,
  GOAL_PLACEHOLDER,
  TARGET_EXAMPLES,
} from "@/lib/student-os/options";
import { PCMB_SUBJECT_IDS } from "@/lib/student-os/syllabus";
import { useStudentOS } from "@/state/student-os";
import { motion } from "framer-motion";
import { Info } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { toast } from "sonner";

/**
 * Settings → Goal. Editing the goal never touches syllabus progress —
 * profile and completions are stored separately.
 */
export default function GoalPage() {
  const { profile, saveProfile } = useStudentOS();
  const navigate = useNavigate();

  const [goal, setGoal] = useState(profile?.goal ?? "");
  const [target, setTarget] = useState(profile?.target ?? "");
  const [exam, setExam] = useState(profile?.exam ?? "");
  const [educationLevel, setEducationLevel] = useState(
    profile?.educationLevel ?? "",
  );
  const [curriculum, setCurriculum] = useState(profile?.curriculum ?? "");
  const [subjects, setSubjects] = useState<string[]>(
    profile ? [...profile.subjects] : [...PCMB_SUBJECT_IDS],
  );
  const [error, setError] = useState<string | null>(null);

  if (!profile) return <Navigate to="/onboarding" replace />;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const problem = !goal.trim()
      ? "Please enter your goal."
      : !target.trim()
        ? "Please enter what you want to achieve."
        : !exam.trim()
          ? "Please enter the exam you're preparing for."
          : !educationLevel.trim()
            ? "Please choose your current class or level."
            : !curriculum.trim()
              ? "Please choose your curriculum."
              : subjects.length === 0
                ? "Select at least one subject to track."
                : null;
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
    toast.success("Goal updated", {
      description: "Your dashboard now reflects your new goal. Syllabus progress is untouched.",
    });
    navigate("/dashboard");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Goal</h1>
        <p className="mt-1.5 text-muted-foreground">
          Update what you&apos;re working toward. Changing it never deletes your
          syllabus progress.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card className="gap-0 py-0">
          <div className="space-y-5 p-6">
            <FormSection
              title="Your goal"
              description="The achievement everything else is organized around."
            >
              <div className="space-y-4">
                <TextField
                  id="goal-input"
                  label="What is your main goal?"
                  placeholder={GOAL_PLACEHOLDER}
                  value={goal}
                  onChange={setGoal}
                />
                <TextField
                  id="target-input"
                  label="What do you want to achieve?"
                  placeholder="e.g. 1st Position, Top 10, Get A+..."
                  value={target}
                  onChange={setTarget}
                />
                <ExampleChips values={TARGET_EXAMPLES} onPick={setTarget} />
                <TextField
                  id="exam-input"
                  label="What exam or admission process are you preparing for?"
                  placeholder="e.g. BUET Admission, HSC, Medical Admission..."
                  value={exam}
                  onChange={setExam}
                />
                <ExampleChips values={EXAM_EXAMPLES} onPick={setExam} />
              </div>
            </FormSection>
          </div>

          <div className="space-y-5 border-t p-6">
            <FormSection
              title="Education"
              description="Your current class or level, and the curriculum you follow."
            >
              <div className="space-y-5">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Current class / level</p>
                  <ChoiceSelect
                    options={EDUCATION_LEVEL_OPTIONS}
                    initialValue={educationLevel}
                    onChange={setEducationLevel}
                    customPlaceholder="Type your class or level"
                    ariaLabel="Current class or level"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Curriculum</p>
                  <ChoiceSelect
                    options={CURRICULUM_OPTIONS}
                    initialValue={curriculum}
                    onChange={setCurriculum}
                    customPlaceholder="Type your curriculum"
                    ariaLabel="Curriculum"
                  />
                </div>
              </div>
            </FormSection>
          </div>

          <div className="space-y-5 border-t p-6">
            <FormSection
              title="Subjects"
              description="Subjects you're tracking. Deselected subjects keep their progress if you add them back later."
            >
              <SubjectPicker selectedIds={subjects} onChange={setSubjects} />
            </FormSection>
          </div>

          <div className="flex flex-col gap-3 border-t p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <p>
                Goal details are stored separately from syllabus completions.
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="cursor-pointer"
                onClick={() => navigate("/dashboard")}
              >
                Cancel
              </Button>
              <Button type="submit" className="cursor-pointer">
                Save goal
              </Button>
            </div>
          </div>
        </Card>

        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
      </form>
    </motion.div>
  );
}
