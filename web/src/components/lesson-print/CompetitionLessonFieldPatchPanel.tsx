"use client";

import { Loader2, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CompetitionLessonPlan } from "@/lib/competition-lesson-contract";
import {
  COMPETITION_LESSON_EDITABLE_FIELDS,
  getCompetitionLessonEditableField,
} from "@/lib/competition-lesson-fields";
import { competitionLessonPlanToMarkdown } from "@/lib/competition-lesson-markdown";
import { competitionLessonPatchResponseSchema } from "@/lib/competition-lesson-patch";

interface CompetitionLessonFieldPatchPanelProps {
  disabled?: boolean;
  lessonPlan: CompetitionLessonPlan;
  onMarkdownChange?: (markdown: string) => void;
  onPatchApplied?: (input: {
    lessonPlan?: CompetitionLessonPlan;
    markdown: string;
    summary: string;
  }) => Promise<void> | void;
}

function summarizeOperations(paths: string[]) {
  return paths
    .map((path) => getCompetitionLessonEditableField(path)?.label ?? path)
    .join("、");
}

export default function CompetitionLessonFieldPatchPanel({
  disabled = false,
  lessonPlan,
  onMarkdownChange,
  onPatchApplied,
}: CompetitionLessonFieldPatchPanelProps) {
  const [selectedPath, setSelectedPath] = useState(COMPETITION_LESSON_EDITABLE_FIELDS[0]?.path ?? "/title");
  const [instruction, setInstruction] = useState("");
  const [isPatching, setIsPatching] = useState(false);
  const selectedField = useMemo(() => getCompetitionLessonEditableField(selectedPath), [selectedPath]);
  const currentValue = selectedField?.read(lessonPlan) ?? "";
  const canSubmit = Boolean(instruction.trim()) && !disabled && !isPatching;

  const submitPatch = () => {
    void (async () => {
      if (!canSubmit) {
        return;
      }

      setIsPatching(true);

      try {
        const response = await fetch("/api/competition-lesson-patches", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            instruction: instruction.trim(),
            lessonPlan,
            targetPaths: [selectedPath],
          }),
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
              ? payload.error
              : "结构化教案局部修改失败。",
          );
        }

        const parsedPayload = competitionLessonPatchResponseSchema.safeParse(payload);

        if (!parsedPayload.success) {
          throw new Error("结构化教案局部修改响应不合法。");
        }

        const markdown = competitionLessonPlanToMarkdown(parsedPayload.data.lessonPlan);
        const changedPaths = parsedPayload.data.patch.operations.map((operation) => operation.path);
        const summary = `结构化字段修改：${summarizeOperations(changedPaths)}`;

        if (onPatchApplied) {
          await onPatchApplied({
            lessonPlan: parsedPayload.data.lessonPlan,
            markdown,
            summary,
          });
        } else {
          onMarkdownChange?.(markdown);
        }

        setInstruction("");
        toast.success("结构化字段已修改", {
          description: summary,
        });
      } catch (patchError) {
        toast.error("结构化字段修改失败", {
          description: patchError instanceof Error ? patchError.message : "请稍后重试。",
        });
      } finally {
        setIsPatching(false);
      }
    })();
  };

  return (
    <aside className="no-print flex min-h-0 flex-col rounded-2xl border border-border bg-card shadow-xs">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Wand2 className="size-4 text-brand" />
          <h3 className="text-sm font-semibold text-foreground">字段级 AI 修改</h3>
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          选择一个稳定字段路径，AI 只返回 patch，不重写整篇教案。
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="space-y-2">
          <label className="text-xs font-medium text-foreground" htmlFor="competition-field-path">
            修改位置
          </label>
          <Select onValueChange={setSelectedPath} value={selectedPath}>
            <SelectTrigger className="w-full" id="competition-field-path">
              <SelectValue placeholder="选择字段" />
            </SelectTrigger>
            <SelectContent>
              {COMPETITION_LESSON_EDITABLE_FIELDS.map((field) => (
                <SelectItem key={field.path} value={field.path}>
                  {field.group} / {field.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedField ? (
            <p className="text-xs leading-5 text-muted-foreground">{selectedField.description}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">当前内容</p>
          <div className="max-h-36 overflow-y-auto rounded-lg border border-border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
            {currentValue || "当前字段暂无内容。"}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-foreground" htmlFor="competition-field-instruction">
            修改要求
          </label>
          <Textarea
            className="min-h-28 resize-none text-sm"
            disabled={disabled || isPatching}
            id="competition-field-instruction"
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="例如：把评价标准改得更具体，并强调安全距离。"
            value={instruction}
          />
        </div>
      </div>

      <div className="border-t border-border p-4">
        <Button className="w-full" disabled={!canSubmit} onClick={submitPatch} type="button" variant="brand">
          {isPatching ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
          应用字段修改
        </Button>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          修改后会先通过结构化 Schema 校验，再同步回当前教案版本。
        </p>
      </div>
    </aside>
  );
}
