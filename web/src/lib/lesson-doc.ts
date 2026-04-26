import type { JSONContent } from "@tiptap/react";

const DOCUMENT_NODE_TYPES_WITH_IDS = new Set(["heading", "paragraph", "listItem"]);

function createNodeId(prefix: string, index: number) {
  return `${prefix}-${index.toString(36)}`;
}

function createTextContent(text: string): JSONContent[] | undefined {
  return text ? [{ type: "text", text }] : undefined;
}

function createParagraph(text: string, index: number): JSONContent {
  return {
    type: "paragraph",
    attrs: { id: createNodeId("para", index) },
    content: createTextContent(text),
  };
}

function createHeading(line: string, index: number): JSONContent {
  const match = /^(#{1,6})\s+(.*)$/.exec(line);
  const level = match?.[1]?.length ?? 1;
  const text = match?.[2]?.trim() ?? line.replace(/^#+\s*/, "").trim();

  return {
    type: "heading",
    attrs: {
      id: createNodeId("heading", index),
      level,
    },
    content: createTextContent(text),
  };
}

function createListItem(text: string, index: number): JSONContent {
  return {
    type: "listItem",
    attrs: { id: createNodeId("item", index) },
    content: [createParagraph(text, index)],
  };
}

function flushParagraph(buffer: string[], content: JSONContent[], nodeIndex: { value: number }) {
  const text = buffer.join("\n").trim();

  if (text) {
    content.push(createParagraph(text, nodeIndex.value));
    nodeIndex.value += 1;
  }

  buffer.length = 0;
}

function flushBulletList(items: string[], content: JSONContent[], nodeIndex: { value: number }) {
  if (items.length === 0) {
    return;
  }

  content.push({
    type: "bulletList",
    content: items.map((item) => {
      const node = createListItem(item, nodeIndex.value);
      nodeIndex.value += 1;
      return node;
    }),
  });
  items.length = 0;
}

export function markdownToLessonDoc(markdown: string): JSONContent {
  const content: JSONContent[] = [];
  const paragraphBuffer: string[] = [];
  const bulletItems: string[] = [];
  const nodeIndex = { value: 1 };

  markdown
    .replace(/\r\n/g, "\n")
    .split("\n")
    .forEach((rawLine) => {
      const line = rawLine.trimEnd();
      const trimmed = line.trim();
      const bulletMatch = /^[-*]\s+(.*)$/.exec(trimmed);

      if (!trimmed) {
        flushParagraph(paragraphBuffer, content, nodeIndex);
        flushBulletList(bulletItems, content, nodeIndex);
        return;
      }

      if (/^#{1,6}\s+/.test(trimmed)) {
        flushParagraph(paragraphBuffer, content, nodeIndex);
        flushBulletList(bulletItems, content, nodeIndex);
        content.push(createHeading(trimmed, nodeIndex.value));
        nodeIndex.value += 1;
        return;
      }

      if (bulletMatch) {
        flushParagraph(paragraphBuffer, content, nodeIndex);
        bulletItems.push(bulletMatch[1]?.trim() ?? "");
        return;
      }

      flushBulletList(bulletItems, content, nodeIndex);
      paragraphBuffer.push(line);
    });

  flushParagraph(paragraphBuffer, content, nodeIndex);
  flushBulletList(bulletItems, content, nodeIndex);

  return {
    type: "doc",
    content: content.length ? content : [createParagraph("", 1)],
  };
}

export function lessonDocTextFromNode(node: JSONContent): string {
  if (node.type === "text") {
    return node.text ?? "";
  }

  return node.content?.map(lessonDocTextFromNode).join(node.type === "hardBreak" ? "\n" : "") ?? "";
}

function serializeNode(node: JSONContent): string {
  if (node.type === "heading") {
    const level = Number(node.attrs?.level ?? 1);
    return `${"#".repeat(Math.max(1, Math.min(level, 6)))} ${lessonDocTextFromNode(node).trim()}`;
  }

  if (node.type === "paragraph") {
    return lessonDocTextFromNode(node).trim();
  }

  if (node.type === "bulletList") {
    return (
      node.content
        ?.map((item) => `- ${lessonDocTextFromNode(item).trim()}`)
        .filter((line) => line.trim() !== "-")
        .join("\n") ?? ""
    );
  }

  if (node.type === "orderedList") {
    return node.content?.map((item, index) => `${index + 1}. ${lessonDocTextFromNode(item).trim()}`).join("\n") ?? "";
  }

  if (node.type === "blockquote") {
    return node.content?.map(serializeNode).join("\n").replace(/^/gm, "> ") ?? "";
  }

  if (node.type === "horizontalRule") {
    return "---";
  }

  return lessonDocTextFromNode(node).trim();
}

export function lessonDocToMarkdown(doc: JSONContent): string {
  return (
    doc.content
      ?.map(serializeNode)
      .map((part) => part.trim())
      .filter(Boolean)
      .join("\n\n") ?? ""
  );
}

export function ensureLessonDocNodeIds(doc: JSONContent): JSONContent {
  let nextIndex = 1;

  const visit = (node: JSONContent): JSONContent => {
    const attrs = { ...(node.attrs ?? {}) };

    if (node.type && DOCUMENT_NODE_TYPES_WITH_IDS.has(node.type) && !attrs.id) {
      attrs.id = createNodeId(node.type, nextIndex);
      nextIndex += 1;
    }

    return {
      ...node,
      ...(Object.keys(attrs).length ? { attrs } : {}),
      ...(node.content ? { content: node.content.map(visit) } : {}),
    };
  };

  return visit(doc);
}
