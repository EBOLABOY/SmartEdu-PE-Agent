"use client";

import React, { forwardRef, useImperativeHandle, useMemo, useRef } from "react";

import { AutoScrollArea } from "@/components/ai-elements/auto-scroll";
import CompetitionLessonPrintView from "@/components/lesson-print/CompetitionLessonPrintView";
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
      <div className="relative h-full w-full">
        <AutoScrollArea
          className="h-full w-full bg-slate-200"
          contentClassName="py-6"
          scrollClassName="overflow-auto"
        >
          <CompetitionLessonPrintView lesson={lesson} />
        </AutoScrollArea>

        <iframe
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 h-0 w-0 border-0 opacity-0"
          ref={iframeRef}
          srcDoc={printHtml}
          tabIndex={-1}
          title="打印专用课时计划容器"
        />
      </div>
    );
  },
);

export default CompetitionLessonPrintFrame;
