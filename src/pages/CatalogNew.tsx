import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAccountLabel } from "@/hooks/use-account-label";
import {
  CATALOG_CATEGORIES,
  type CatalogCategory,
} from "@/lib/student-os/catalog";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/state/workspace";
import { motion } from "framer-motion";
import { ArrowLeft, ImagePlus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

const MAX_IMAGE_BYTES = 250 * 1024;

/** Post or upload your own content to the shared catalog. */
export default function CatalogNewPage() {
  const { addPost } = useWorkspace();
  const accountLabel = useAccountLabel();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<CatalogCategory>("Guide");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Please choose an image smaller than 250 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result));
    reader.onerror = () =>
      toast.error("That file could not be read. Try another image.");
    reader.readAsDataURL(file);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setError("Give your post a title.");
      return;
    }
    if (!summary.trim()) {
      setError("Add a one-line summary so people know what this is.");
      return;
    }
    if (!description.trim()) {
      setError("Add a short description.");
      return;
    }
    setError(null);

    const id = addPost({
      title: title.trim(),
      category,
      summary: summary.trim(),
      description: description.trim(),
      provider: accountLabel,
      price: 0,
      bookable: false,
      image: image ?? undefined,
      link: link.trim() || undefined,
    });

    toast.success("Published to the catalog", {
      description: "Your post is now visible to everyone using Student OS V1.",
    });
    navigate(`/catalog/${id}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mx-auto max-w-2xl space-y-6"
    >
      <Link
        to="/catalog"
        className="inline-flex w-fit cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Catalog
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Post to the catalog
        </h1>
        <p className="mt-1.5 text-muted-foreground">
          Share a resource, guide, or note with other students. You can remove
          it any time from the admin area.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-xl border bg-card p-6">
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="post-title">Title</Label>
              <Input
                id="post-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. My vectors revision notes"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <div role="group" aria-label="Category" className="flex flex-wrap gap-2">
                {CATALOG_CATEGORIES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={category === option}
                    onClick={() => setCategory(option)}
                    className={cn(
                      "cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition-colors",
                      category === option
                        ? "border-primary/60 bg-primary/10 font-medium text-primary"
                        : "border-border text-foreground hover:border-primary/40 hover:bg-accent",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="post-summary">One-line summary</Label>
              <Input
                id="post-summary"
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder="A short line describing what you're sharing"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="post-description">Description</Label>
              <Textarea
                id="post-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Write the full details..."
                rows={5}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="post-link">Link (optional)</Label>
              <Input
                id="post-link"
                value={link}
                onChange={(event) => setLink(event.target.value)}
                placeholder="https://..."
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="post-image">Image (optional)</Label>
              {image ? (
                <div className="space-y-2">
                  <img
                    src={image}
                    alt="Upload preview"
                    className="max-h-56 w-full rounded-xl border object-cover"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => setImage(null)}
                  >
                    <X className="size-3.5" aria-hidden />
                    Remove image
                  </Button>
                </div>
              ) : (
                <div>
                  <input
                    id="post-image"
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) => handleFile(event.target.files?.[0])}
                  />
                  <Label
                    htmlFor="post-image"
                    className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
                  >
                    <ImagePlus className="size-4" aria-hidden />
                    Choose an image
                  </Label>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Up to 250 KB, stored on this device.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            className="cursor-pointer"
            onClick={() => navigate("/catalog")}
          >
            Cancel
          </Button>
          <Button type="submit" className="cursor-pointer">
            Publish
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
