"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Loader2, MessageSquare } from "lucide-react";
import { submitSeerrIssue, type SeerrIssueType } from "@/src/actions/seerr";
import { toast } from "sonner";

interface ReportIssueDialogProps {
  isOpen: boolean;
  onClose: () => void;
  mediaId: number;
  title: string;
}

const ISSUE_TYPES: { value: SeerrIssueType; label: string; hint: string }[] = [
  { value: 1, label: "Video", hint: "Pixelation, freezing, wrong aspect, missing video" },
  { value: 2, label: "Audio", hint: "Out of sync, missing track, wrong language" },
  { value: 3, label: "Subtitle", hint: "Missing, wrong language, mistimed" },
  { value: 4, label: "Other", hint: "Anything else" },
];

const MIN_MESSAGE_LENGTH = 8;

export function ReportIssueDialog({
  isOpen,
  onClose,
  mediaId,
  title,
}: ReportIssueDialogProps) {
  const [issueType, setIssueType] = useState<SeerrIssueType>(1);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (trimmed.length < MIN_MESSAGE_LENGTH) {
      toast.error("Add a few words describing the problem");
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitSeerrIssue({
        mediaId,
        issueType,
        message: trimmed,
      });
      if (result.success) {
        toast.success("Issue reported");
        setMessage("");
        setIssueType(1);
        onClose();
      } else {
        toast.error(result.message ?? "Failed to report issue");
      }
    } catch {
      toast.error("Failed to report issue");
    } finally {
      setSubmitting(false);
    }
  };

  const activeHint = ISSUE_TYPES.find((t) => t.value === issueType)?.hint;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Report an issue
          </DialogTitle>
          <DialogDescription>
            Something wrong with <span className="text-foreground font-medium">{title}</span>?
            We&apos;ll log it for the admin to look at.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-foreground text-sm font-medium">
              Type of issue
            </label>
            <Select
              value={String(issueType)}
              onValueChange={(v) => setIssueType(Number(v) as SeerrIssueType)}
              disabled={submitting}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ISSUE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={String(t.value)}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeHint && (
              <p className="text-muted-foreground text-xs">{activeHint}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-foreground text-sm font-medium" htmlFor="issue-message">
              What happened
            </label>
            <textarea
              id="issue-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Audio drifts out of sync after the 20-minute mark"
              rows={4}
              maxLength={1000}
              disabled={submitting}
              className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring resize-none rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p className="text-muted-foreground text-right text-xs tabular-nums">
              {message.length} / 1000
            </p>
          </div>
        </div>

        <DialogFooter className="flex-row gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 sm:flex-none"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || message.trim().length < MIN_MESSAGE_LENGTH}
            className="flex-1 sm:flex-none"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              "Submit"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
