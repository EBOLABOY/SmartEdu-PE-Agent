"use client";

import { Sources, SourcesContent, SourcesTrigger } from "@/components/ai-elements/sources";
import { SelectableSurfaceLink } from "@/components/ui/state-surface";

export type AssistantSourceListItem = {
  citation?: string;
  description?: string;
  href?: string;
  id: string;
  title: string;
};

function getSourceSupportText(source: AssistantSourceListItem) {
  return source.citation ?? source.description ?? "";
}

export function AssistantSourceList({
  label,
  sources,
}: {
  label: string;
  sources: AssistantSourceListItem[];
}) {
  if (!sources.length) {
    return null;
  }

  return (
    <Sources className="mt-3 mb-0 rounded-xl border border-border/60 bg-background/60 p-2.5 text-muted-foreground">
      <SourcesTrigger className="text-foreground" count={sources.length}>
        <span className="font-medium">
          {label} {sources.length} 条
        </span>
      </SourcesTrigger>
      <SourcesContent className="w-full">
        {sources.map((source) => {
          const supportText = getSourceSupportText(source);

          return (
            <SelectableSurfaceLink
              aria-disabled={source.href ? undefined : true}
              className="rounded-lg px-3 py-2 text-xs"
              href={source.href}
              key={source.id}
              rel={source.href ? "noreferrer" : undefined}
              target={source.href ? "_blank" : undefined}
              title={source.title}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">{source.title}</span>
                {supportText ? (
                  <span className="mt-0.5 line-clamp-2 block text-muted-foreground">
                    {supportText}
                  </span>
                ) : null}
              </span>
            </SelectableSurfaceLink>
          );
        })}
      </SourcesContent>
    </Sources>
  );
}
