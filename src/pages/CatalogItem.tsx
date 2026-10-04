import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useAccountLabel } from "@/hooks/use-account-label";
import { formatRelativeDay } from "@/lib/student-os/format";
import { formatPrice } from "@/lib/student-os/catalog";
import {
  useCatalogItem,
  useItemComments,
  useWorkspace,
} from "@/state/workspace";
import { motion } from "framer-motion";
import { ArrowLeft, ExternalLink, MessageSquare } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useParams } from "react-router";

/** Catalog detail — one item, its description, and a comment thread. */
export default function CatalogItemPage() {
  const { itemId } = useParams();
  const item = useCatalogItem(itemId);
  const comments = useItemComments(itemId ?? "");
  const { addComment } = useWorkspace();
  const accountLabel = useAccountLabel();
  const [draft, setDraft] = useState("");

  if (!item) return <Navigate to="/catalog" replace />;

  const actionLabel = item.bookable
    ? "Book a session"
    : item.price > 0
      ? `Enroll for ${formatPrice(item.price)}`
      : "Get it free";

  const postComment = () => {
    const body = draft.trim();
    if (!body) return;
    addComment(item.id, accountLabel, body);
    setDraft("");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="space-y-6"
    >
      <Link
        to="/catalog"
        className="inline-flex w-fit cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Catalog
      </Link>

      <div className="rounded-xl border bg-card p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {item.category}
          </span>
          {item.source === "user" ? (
            <span className="text-[11px] font-medium text-primary">
              Posted by a student
            </span>
          ) : null}
        </div>

        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
          {item.title}
        </h1>
        <p className="mt-2 text-muted-foreground">{item.summary}</p>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="text-muted-foreground">{item.provider}</span>
          <span className="font-semibold">{formatPrice(item.price)}</span>
          {item.bookable ? (
            <span className="rounded-lg bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              Bookable session
            </span>
          ) : null}
        </div>

        {item.image ? (
          <img
            src={item.image}
            alt=""
            className="mt-5 max-h-72 w-full rounded-xl object-cover"
          />
        ) : null}

        <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
          {item.description}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button className="cursor-pointer" asChild>
            <Link to={`/book/${item.id}`}>{actionLabel}</Link>
          </Button>
          {item.link ? (
            <Button variant="outline" className="cursor-pointer" asChild>
              <a href={item.link} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" aria-hidden />
                Visit link
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      <Card className="gap-4">
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
            >
              <MessageSquare className="size-4" />
            </span>
            <CardTitle className="text-base">
              Comments {comments.length > 0 ? `(${comments.length})` : ""}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No comments yet — be the first to ask a question about this item.
            </p>
          ) : (
            <ul className="space-y-4">
              {comments.map((comment) => (
                <li key={comment.id} className="flex gap-3">
                  <span
                    aria-hidden
                    className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                  >
                    {comment.author.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">{comment.author}</span>
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {formatRelativeDay(comment.createdAt)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-sm leading-relaxed break-words text-muted-foreground">
                      {comment.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-2 border-t pt-4">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Write a message or question..."
              rows={3}
              aria-label="Write a comment"
            />
            <div className="flex justify-end">
              <Button
                className="cursor-pointer"
                disabled={!draft.trim()}
                onClick={postComment}
              >
                Post comment
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
