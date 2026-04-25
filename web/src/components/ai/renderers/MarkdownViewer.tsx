import { MessageResponse } from "@/components/ai-elements/message";

interface MarkdownViewerProps {
  content: string;
}

export default function MarkdownViewer({ content }: MarkdownViewerProps) {
  const normalizedContent = content.trim();

  return (
    <div className="h-full w-full overflow-y-auto bg-card p-8 text-foreground">
      <div className="mx-auto max-w-4xl leading-relaxed">
        {normalizedContent ? (
          <MessageResponse>{normalizedContent}</MessageResponse>
        ) : (
          <div className="flex min-h-[420px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/50 text-center">
            <p className="text-base font-medium text-foreground">等待教案生成</p>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              请输入课程主题，系统会先生成可审阅的教案；确认教案无误后，再生成互动大屏。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
