"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import UniqueID from "@tiptap/extension-unique-id";
import { Edit3, Eye, Redo2, RotateCcw, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { MessageResponse } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import {
  ensureLessonDocNodeIds,
  lessonDocToMarkdown,
  markdownToLessonDoc,
} from "@/lib/lesson-doc";

type EditableNodeType = "heading" | "paragraph" | "listItem";

interface LessonEditorProps {
  content: string;
  disabled?: boolean;
  onMarkdownChange?: (markdown: string) => void;
}

const EDITABLE_NODE_TYPES: EditableNodeType[] = ["heading", "paragraph", "listItem"];

export default function LessonEditor({
  content,
  disabled = false,
  onMarkdownChange,
}: LessonEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [revision, setRevision] = useState(0);
  const onMarkdownChangeRef = useRef(onMarkdownChange);
  const initialDoc = useMemo(() => ensureLessonDocNodeIds(markdownToLessonDoc(content)), [content]);

  useEffect(() => {
    onMarkdownChangeRef.current = onMarkdownChange;
  }, [onMarkdownChange]);

  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions: [
      StarterKit,
      UniqueID.configure({
        attributeName: "id",
        types: EDITABLE_NODE_TYPES,
      }),
    ],
    content: initialDoc,
    editorProps: {
      attributes: {
        class:
          "lesson-editor-content min-h-full px-8 py-7 outline-none selection:bg-brand/20",
      },
    },
    onUpdate: ({ editor: updatedEditor }) => {
      onMarkdownChangeRef.current?.(lessonDocToMarkdown(updatedEditor.getJSON()));
      setRevision((value) => value + 1);
    },
    onTransaction: () => {
      setRevision((value) => value + 1);
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    const nextDoc = ensureLessonDocNodeIds(markdownToLessonDoc(content));
    editor.commands.setContent(nextDoc, { emitUpdate: false });
  }, [content, editor]);

  useEffect(() => {
    editor?.setEditable(isEditing && !disabled);
  }, [disabled, editor, isEditing]);

  const undo = () => {
    editor?.chain().focus().undo().run();
  };

  const redo = () => {
    editor?.chain().focus().redo().run();
  };

  const resetToArtifact = () => {
    if (!editor) {
      return;
    }

    const nextDoc = ensureLessonDocNodeIds(markdownToLessonDoc(content));
    editor.commands.setContent(nextDoc, { emitUpdate: true });
  };

  const toggleEditing = () => {
    setIsEditing((value) => !value);
  };

  const canUndo = Boolean(editor?.can().undo());
  const canRedo = Boolean(editor?.can().redo());

  void revision;

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 px-5 py-2.5">
        <div>
          <p className="text-xs font-medium text-foreground">
            {isEditing ? "结构化编辑模式" : "预览模式"}
          </p>
          <p className="text-xs text-muted-foreground">
            {isEditing
              ? "段落与列表编辑支持撤销、重做；表格版式请退出编辑后在预览中核对。"
              : "按广东省比赛教案观感渲染标题、段落和 Markdown 表格。"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={disabled} onClick={toggleEditing} size="sm" type="button" variant={isEditing ? "brand" : "outline"}>
            {isEditing ? <Eye className="size-4" /> : <Edit3 className="size-4" />}
            {isEditing ? "退出编辑" : "编辑教案"}
          </Button>
          <Button disabled={!isEditing || !canUndo || disabled} onClick={undo} size="sm" type="button" variant="outline">
            <Undo2 className="size-4" />
            撤销
          </Button>
          <Button disabled={!isEditing || !canRedo || disabled} onClick={redo} size="sm" type="button" variant="outline">
            <Redo2 className="size-4" />
            重做
          </Button>
          <Button disabled={!isEditing || disabled} onClick={resetToArtifact} size="sm" type="button" variant="outline">
            <RotateCcw className="size-4" />
            回到生成版本
          </Button>
        </div>
      </div>

      <div className={`min-h-0 flex-1 overflow-y-auto ${isEditing ? "bg-background" : "bg-card"}`}>
        {isEditing ? (
          <EditorContent editor={editor} />
        ) : (
          <div className="competition-lesson-preview min-h-full px-8 py-7">
            <MessageResponse>{content}</MessageResponse>
          </div>
        )}
      </div>
    </div>
  );
}
