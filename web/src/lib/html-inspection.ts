import {
  defaultTreeAdapter,
  html as parse5Html,
  parse,
  serialize,
  type DefaultTreeAdapterTypes,
} from "parse5";

type HtmlNode = DefaultTreeAdapterTypes.Node;
type HtmlParentNode = DefaultTreeAdapterTypes.ParentNode;
type HtmlChildNode = DefaultTreeAdapterTypes.ChildNode;
type HtmlElement = DefaultTreeAdapterTypes.Element;
type HtmlDocument = DefaultTreeAdapterTypes.Document;

function isParentNode(node: HtmlNode): node is HtmlParentNode {
  return "childNodes" in node;
}

function isElement(node: HtmlNode): node is HtmlElement {
  return "tagName" in node;
}

function isTextNode(node: HtmlNode): node is DefaultTreeAdapterTypes.TextNode {
  return node.nodeName === "#text";
}

function isDocumentType(node: HtmlNode): node is DefaultTreeAdapterTypes.DocumentType {
  return node.nodeName === "#documentType";
}

function walkHtml(node: HtmlNode, visit: (node: HtmlNode) => void) {
  visit(node);

  if (!isParentNode(node)) {
    return;
  }

  for (const childNode of node.childNodes) {
    walkHtml(childNode, visit);
  }
}

function hasSourceLocation(element: HtmlElement) {
  return Boolean(element.sourceCodeLocation);
}

export function parseHtmlDocument(htmlContent: string) {
  return parse(htmlContent, { sourceCodeLocationInfo: true });
}

export function getHtmlElements(root: HtmlNode, tagName?: string) {
  const elements: HtmlElement[] = [];
  const normalizedTagName = tagName?.toLowerCase();

  walkHtml(root, (node) => {
    if (!isElement(node)) {
      return;
    }

    if (!normalizedTagName || node.tagName === normalizedTagName) {
      elements.push(node);
    }
  });

  return elements;
}

export function getHtmlElement(root: HtmlNode, tagName: string) {
  return getHtmlElements(root, tagName)[0] ?? null;
}

export function getHtmlAttribute(element: HtmlElement, name: string) {
  const normalizedName = name.toLowerCase();
  return element.attrs.find((attr) => attr.name.toLowerCase() === normalizedName)?.value ?? null;
}

export function hasHtmlClass(element: HtmlElement, className: string) {
  return (getHtmlAttribute(element, "class") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .includes(className);
}

export function hasSourcedHtmlElement(document: HtmlDocument, tagName: string) {
  return getHtmlElements(document, tagName).some(hasSourceLocation);
}

export function hasDoctype(document: HtmlDocument) {
  return document.childNodes.some(isDocumentType);
}

function normalizeUrlLikeValue(value: string | null) {
  return (value ?? "").replace(/[\u0000-\u001F\u007F\s]+/g, "").trim();
}

export function isExternalHttpUrl(value: string | null) {
  return /^(?:https?:)?\/\//i.test(normalizeUrlLikeValue(value));
}

export function hasJavascriptUrl(value: string | null) {
  return /^javascript:/i.test(normalizeUrlLikeValue(value));
}

export function getElementText(element: HtmlElement) {
  return getVisibleText(element, { includeTags: new Set([element.tagName]) });
}

export function getVisibleText(
  root: HtmlNode,
  options: { includeTags?: Set<string>; skipTags?: Set<string> } = {},
) {
  const text: string[] = [];
  const skipTags = options.skipTags ?? new Set(["script", "style", "template"]);

  function visit(node: HtmlNode, skipped: boolean) {
    if (isElement(node)) {
      const nextSkipped =
        skipped ||
        (skipTags.has(node.tagName) && !options.includeTags?.has(node.tagName));

      for (const childNode of node.childNodes) {
        visit(childNode, nextSkipped);
      }

      return;
    }

    if (isTextNode(node) && !skipped) {
      text.push(node.value);
      return;
    }

    if (!isParentNode(node)) {
      return;
    }

    for (const childNode of node.childNodes) {
      visit(childNode, skipped);
    }
  }

  visit(root, false);
  return text.join(" ").replace(/\s+/g, " ").trim();
}

export function injectHeadMeta(htmlContent: string, attrs: Array<{ name: string; value: string }>) {
  const document = parseHtmlDocument(htmlContent);
  const headElement = getHtmlElement(document, "head");
  const htmlElement = getHtmlElement(document, "html");

  if (!headElement || !htmlElement || !hasSourceLocation(htmlElement)) {
    const serializedAttrs = attrs
      .map(({ name, value }) => `${name}="${value.replaceAll('"', "&quot;")}"`)
      .join(" ");

    return `<!DOCTYPE html><html lang="zh-CN"><head><meta ${serializedAttrs}><meta charset="utf-8"></head><body>${htmlContent}</body></html>`;
  }

  const metaElement = defaultTreeAdapter.createElement("meta", parse5Html.NS.HTML, attrs);
  const firstHeadChild = headElement.childNodes[0] as HtmlChildNode | undefined;

  if (firstHeadChild) {
    defaultTreeAdapter.insertBefore(headElement, metaElement, firstHeadChild);
  } else {
    defaultTreeAdapter.appendChild(headElement, metaElement);
  }

  return serialize(document);
}
