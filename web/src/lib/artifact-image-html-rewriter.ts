import { isArtifactImageProxyUrl } from "@/lib/s3/artifact-image-url";

type CandidateAttribute = {
  attrName: string;
  tagName: string;
};

type Parse5Attribute = {
  name: string;
  value: string;
};

type Parse5Node = {
  attrs?: Parse5Attribute[];
  childNodes?: Parse5Node[];
  content?: Parse5Node;
  nodeName?: string;
  tagName?: string;
};

export type RewriteArtifactImageUrlsResult = {
  html: string;
  rewrittenCount: number;
  warnings: string[];
};

export type RewriteArtifactImageUrlsInput = {
  htmlContent: string;
  resolveReplacementUrl: (source: string) => Promise<string>;
};

const CANDIDATE_ATTRIBUTES: CandidateAttribute[] = [
  { attrName: "src", tagName: "img" },
  { attrName: "src", tagName: "source" },
  { attrName: "poster", tagName: "video" },
  { attrName: "href", tagName: "image" },
  { attrName: "xlink:href", tagName: "image" },
];

function buildRewriteWarning(source: string, error: unknown) {
  return `受控图片资源改写失败：${source}（${error instanceof Error ? error.message : "unknown-error"}）`;
}

function normalizeTagName(tagName: string | null | undefined) {
  return (tagName ?? "").trim().toLowerCase();
}

function getCandidateAttributes(tagName: string) {
  return CANDIDATE_ATTRIBUTES.filter((candidate) => candidate.tagName === tagName);
}

async function createReplacementResolver(input: RewriteArtifactImageUrlsInput) {
  const warnings: string[] = [];
  const cache = new Map<string, Promise<string | null>>();

  const resolveReplacement = async (source: string) => {
    const normalizedSource = source.trim();

    if (!normalizedSource || !isArtifactImageProxyUrl(normalizedSource)) {
      return null;
    }

    let pending = cache.get(normalizedSource);

    if (!pending) {
      pending = input.resolveReplacementUrl(normalizedSource)
        .then((value) => value.trim())
        .catch((error) => {
          warnings.push(buildRewriteWarning(normalizedSource, error));
          return null;
        });
      cache.set(normalizedSource, pending);
    }

    return pending;
  };

  return {
    resolveReplacement,
    warnings,
  };
}

async function rewriteWithDomParser(input: RewriteArtifactImageUrlsInput) {
  const document = new DOMParser().parseFromString(input.htmlContent, "text/html");
  const { resolveReplacement, warnings } = await createReplacementResolver(input);
  const candidateTagNames = Array.from(new Set(CANDIDATE_ATTRIBUTES.map((candidate) => candidate.tagName)));
  const elements = Array.from(document.querySelectorAll(candidateTagNames.join(", ")));
  let rewrittenCount = 0;

  for (const element of elements) {
    const tagName = normalizeTagName(element.tagName);

    for (const candidate of getCandidateAttributes(tagName)) {
      const source = element.getAttribute(candidate.attrName);

      if (!source) {
        continue;
      }

      const replacement = await resolveReplacement(source);

      if (!replacement) {
        continue;
      }

      element.setAttribute(candidate.attrName, replacement);
      rewrittenCount += 1;
    }
  }

  return {
    html: `<!DOCTYPE html>\n${document.documentElement.outerHTML}`,
    rewrittenCount,
    warnings,
  } satisfies RewriteArtifactImageUrlsResult;
}

function visitParse5Nodes(node: Parse5Node, visitor: (node: Parse5Node) => Promise<void>) {
  const walk = async (currentNode: Parse5Node) => {
    await visitor(currentNode);

    if (currentNode.content) {
      await walk(currentNode.content);
    }

    for (const childNode of currentNode.childNodes ?? []) {
      await walk(childNode);
    }
  };

  return walk(node);
}

function findParse5Attribute(node: Parse5Node, attrName: string) {
  return node.attrs?.find((attribute) => attribute.name === attrName);
}

async function rewriteWithParse5(input: RewriteArtifactImageUrlsInput) {
  const { parse, serialize } = await import("parse5");
  const document = parse(input.htmlContent);
  const { resolveReplacement, warnings } = await createReplacementResolver(input);
  let rewrittenCount = 0;

  await visitParse5Nodes(document as Parse5Node, async (node) => {
    const tagName = normalizeTagName(node.tagName);

    if (!tagName) {
      return;
    }

    for (const candidate of getCandidateAttributes(tagName)) {
      const attribute = findParse5Attribute(node, candidate.attrName);
      const source = attribute?.value;

      if (!attribute || !source) {
        continue;
      }

      const replacement = await resolveReplacement(source);

      if (!replacement) {
        continue;
      }

      attribute.value = replacement;
      rewrittenCount += 1;
    }
  });

  return {
    html: serialize(document),
    rewrittenCount,
    warnings,
  } satisfies RewriteArtifactImageUrlsResult;
}

export async function rewriteArtifactImageUrlsInHtml(
  input: RewriteArtifactImageUrlsInput,
): Promise<RewriteArtifactImageUrlsResult> {
  if (typeof DOMParser !== "undefined") {
    return rewriteWithDomParser(input);
  }

  return rewriteWithParse5(input);
}
