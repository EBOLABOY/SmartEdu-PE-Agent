"use client";

import React, { forwardRef, useImperativeHandle, useMemo, useRef } from "react";

import type { CompetitionLessonPlan } from "@/lib/competition-lesson-contract";
import { buildCompetitionLessonPrintHtml } from "@/lib/competition-lesson-print-document";

export interface CompetitionLessonPrintFrameHandle {
  print: () => void;
}

interface CompetitionLessonPrintFrameProps {
  lesson: CompetitionLessonPlan;
}

const CompetitionLessonPrintFrame = forwardRef<CompetitionLessonPrintFrameHandle, CompetitionLessonPrintFrameProps>(
  function CompetitionLessonPrintFrame({ lesson }, ref) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const printHtml = useMemo(() => buildCompetitionLessonPrintHtml(lesson), [lesson]);

    useImperativeHandle(
      ref,
      () => ({
        print: () => {
          const printWindow = iframeRef.current?.contentWindow;

          if (!printWindow) {
            return;
          }

          printWindow.focus();
          printWindow.print();
        },
      }),
      [],
    );

    return (
      <iframe
        className="h-full w-full border-0 bg-slate-200"
        ref={iframeRef}
        srcDoc={printHtml}
        title="正式打印版教案预览"
      />
    );
  },
);

export default CompetitionLessonPrintFrame;
