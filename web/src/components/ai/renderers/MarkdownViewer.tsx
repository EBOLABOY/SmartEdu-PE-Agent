import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownViewerProps {
  content: string;
}

export default function MarkdownViewer({ content }: MarkdownViewerProps) {
  const normalizedContent = content.trim();
  const Code = ({ className, children, ...props }: React.ComponentPropsWithoutRef<"code">) => {
    const isInline = !className;

    if (isInline) {
      return (
        <code className="rounded bg-neutral-800 px-1 py-0.5 text-sm text-blue-300" {...props}>
          {children}
        </code>
      );
    }

    return (
      <pre className="my-4 overflow-x-auto rounded-md bg-neutral-950 p-4 text-sm">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    );
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-neutral-900 p-8 text-neutral-200">
      <div className="mx-auto max-w-4xl space-y-4 leading-relaxed">
        {normalizedContent ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: (props) => <h1 className="mb-4 border-b border-neutral-700 pb-2 text-3xl font-bold" {...props} />,
              h2: (props) => <h2 className="mb-3 mt-6 text-2xl font-semibold" {...props} />,
              h3: (props) => <h3 className="mb-2 mt-4 text-xl font-medium" {...props} />,
              ul: (props) => <ul className="my-4 list-disc space-y-1 pl-6" {...props} />,
              ol: (props) => <ol className="my-4 list-decimal space-y-1 pl-6" {...props} />,
              li: (props) => <li className="text-neutral-300" {...props} />,
              p: (props) => <p className="mb-4 text-neutral-300" {...props} />,
              table: (props) => <table className="my-4 w-full border-collapse border border-neutral-700" {...props} />,
              th: (props) => <th className="border border-neutral-700 bg-neutral-800 px-4 py-2 text-left" {...props} />,
              td: (props) => <td className="border border-neutral-700 px-4 py-2" {...props} />,
              blockquote: (props) => <blockquote className="my-4 border-l-4 border-blue-500 pl-4 italic text-neutral-400" {...props} />,
              code: Code,
            }}
          >
            {normalizedContent}
          </ReactMarkdown>
        ) : (
          <div className="flex min-h-[420px] flex-col items-center justify-center rounded-xl border border-dashed border-neutral-700 bg-neutral-950/40 text-center">
            <p className="text-base font-medium text-neutral-300">等待教案生成</p>
            <p className="mt-2 max-w-md text-sm text-neutral-500">
              请输入课程主题，系统会先生成可审阅的教案；确认教案无误后，再生成互动大屏。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
