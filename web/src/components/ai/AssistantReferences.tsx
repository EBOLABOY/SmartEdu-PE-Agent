"use client";

import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationCardTrigger,
  InlineCitationCarousel,
  InlineCitationCarouselContent,
  InlineCitationCarouselHeader,
  InlineCitationCarouselIndex,
  InlineCitationCarouselItem,
  InlineCitationCarouselNext,
  InlineCitationCarouselPrev,
  InlineCitationQuote,
  InlineCitationSource,
  InlineCitationText,
} from "@/components/ai-elements/inline-citation";
import { MessageResponse } from "@/components/ai-elements/message";
import { AssistantSourceList } from "@/components/ai/AssistantSourceList";
import type { AssistantSourceItem } from "@/lib/assistant-reference-ui";

export function AssistantInlineCitation({
  citationLabel,
  citationSources,
  sources,
  text,
}: {
  citationLabel: string;
  citationSources: string[];
  sources: AssistantSourceItem[];
  text: string;
}) {
  if (!citationSources.length || !sources.length) {
    return <MessageResponse>{text}</MessageResponse>;
  }

  return (
    <p className="text-sm leading-relaxed">
      <InlineCitation>
        <InlineCitationText>{text}</InlineCitationText>
        <InlineCitationCard>
          <InlineCitationCardTrigger sources={citationSources}>
            {citationLabel}
          </InlineCitationCardTrigger>
          <InlineCitationCardBody>
            <InlineCitationCarousel>
              <InlineCitationCarouselHeader>
                <InlineCitationCarouselPrev />
                <InlineCitationCarouselIndex />
                <InlineCitationCarouselNext />
              </InlineCitationCarouselHeader>
              <InlineCitationCarouselContent>
                {sources.map((source) => (
                  <InlineCitationCarouselItem key={source.id}>
                    <InlineCitationSource
                      description={source.description}
                      title={source.title}
                      url={source.href}
                    />
                    <InlineCitationQuote>{source.citation}</InlineCitationQuote>
                  </InlineCitationCarouselItem>
                ))}
              </InlineCitationCarouselContent>
            </InlineCitationCarousel>
          </InlineCitationCardBody>
        </InlineCitationCard>
      </InlineCitation>
    </p>
  );
}

export function AssistantSources({ sources }: { sources: AssistantSourceItem[] }) {
  return <AssistantSourceList label="课标来源" sources={sources} />;
}
