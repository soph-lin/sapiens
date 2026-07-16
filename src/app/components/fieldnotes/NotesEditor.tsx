"use client";

import { $generateHtmlFromNodes, $generateNodesFromDOM } from "@lexical/html";
import { LinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListItemNode,
  ListNode,
} from "@lexical/list";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $setBlocksType } from "@lexical/selection";
import {
  $createHeadingNode,
  $isHeadingNode,
  HeadingNode,
} from "@lexical/rich-text";
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  type EditorState,
  mergeRegister,
} from "lexical";
import { useEffect, useRef, useState } from "react";
import { $createCalloutNode, $isCalloutNode, CalloutNode } from "./CalloutNode";

type NotesEditorProps = {
  initialContent?: string;
  onChange?: (html: string) => void;
};

const theme = {
  paragraph: "notes-editor-paragraph",
  heading: {
    h1: "notes-editor-h1",
    h2: "notes-editor-h2",
    h3: "notes-editor-h3",
  },
  callout: "notes-editor-callout",
  list: {
    ul: "notes-editor-list-ul",
    ol: "notes-editor-list-ol",
    listitem: "notes-editor-list-item",
  },
  link: "notes-editor-link",
  text: {
    bold: "notes-editor-bold",
    italic: "notes-editor-italic",
    underline: "notes-editor-underline",
    strikethrough: "notes-editor-strikethrough",
  },
};

const initialConfig = {
  namespace: "SapiensNotes",
  theme,
  nodes: [CalloutNode, HeadingNode, ListNode, ListItemNode, LinkNode],
  onError(error: Error) {
    throw error;
  },
};

function InitialContentPlugin({ content }: { content?: string }) {
  const [editor] = useLexicalComposerContext();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current || !content) return;
    initialized.current = true;

    editor.update(() => {
      const dom = new DOMParser().parseFromString(content, "text/html");
      const nodes = $generateNodesFromDOM(editor, dom);
      const root = $getRoot();
      root.clear();
      root.append(...nodes);
    });
  }, [content, editor]);

  return null;
}

function EditorToolbar() {
  const [editor] = useLexicalComposerContext();

  const formatText = (format: "bold" | "italic" | "underline" | "strikethrough") => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
  };

  const insertLink = () => {
    const url = window.prompt("Paste a source URL");
    if (!url) return;
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
  };

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-[#e7e2da] px-4 py-2">
      <BlockTypeSelect />
      <span className="mx-1 h-5 w-px bg-[#e7e2da]" aria-hidden />
      <ToolbarButton label="B" title="Bold" onClick={() => formatText("bold")} />
      <ToolbarButton label="I" title="Italic" onClick={() => formatText("italic")} italic />
      <ToolbarButton label="U" title="Underline" onClick={() => formatText("underline")} underline />
      <ToolbarButton label="S" title="Strikethrough" onClick={() => formatText("strikethrough")} strike />
      <span className="mx-1 h-5 w-px bg-[#e7e2da]" aria-hidden />
      <ToolbarButton label="• list" title="Bulleted list" onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)} />
      <ToolbarButton label="1. list" title="Numbered list" onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)} />
      <ToolbarButton label="Link" title="Add source link" onClick={insertLink} />
    </div>
  );
}

type BlockType = "paragraph" | "h1" | "h2" | "h3" | "callout";

const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  paragraph: "Text",
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  callout: "Callout",
};

function getSelectedBlockType(): BlockType {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return "paragraph";

  const selectedNode = selection.anchor.getNode();
  const block = selectedNode.getTopLevelElement();
  if ($isHeadingNode(block)) {
    const tag = block.getTag();
    return tag === "h1" || tag === "h2" || tag === "h3" ? tag : "paragraph";
  }
  if ($isCalloutNode(block)) return "callout";
  return "paragraph";
}

function BlockTypeSelect() {
  const [editor] = useLexicalComposerContext();
  const [blockType, setBlockType] = useState<BlockType>("paragraph");

  useEffect(() => {
    const updateBlockType = () => {
      editor.getEditorState().read(() => {
        setBlockType(getSelectedBlockType());
      });
    };

    updateBlockType();
    return mergeRegister(
      editor.registerUpdateListener(updateBlockType),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateBlockType();
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor]);

  const changeBlockType = (nextType: BlockType) => {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;

      $setBlocksType(selection, () => {
        if (nextType === "callout") return $createCalloutNode();
        if (nextType === "paragraph") return $createParagraphNode();
        return $createHeadingNode(nextType);
      });
    });
    setBlockType(nextType);
  };

  return (
    <label className="relative flex items-center">
      <span className="sr-only">Block type</span>
      <select
        aria-label="Block type"
        value={blockType}
        onChange={(event) => changeBlockType(event.target.value as BlockType)}
        className="notes-editor-block-select cursor-pointer appearance-none rounded-md bg-transparent py-1 pl-2 pr-7 text-[11px] text-[#756f66] transition-colors hover:bg-[#f1eee8] hover:text-[#27231f] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#96734d]"
      >
        {(Object.keys(BLOCK_TYPE_LABELS) as BlockType[]).map((type) => (
          <option key={type} value={type}>
            {BLOCK_TYPE_LABELS[type]}
          </option>
        ))}
      </select>
      <span
        className="pointer-events-none absolute right-2 text-[10px] text-[#a59a8c]"
        aria-hidden
      >
        ▾
      </span>
    </label>
  );
}

function ToolbarButton({
  label,
  title,
  onClick,
  italic = false,
  underline = false,
  strike = false,
}: {
  label: string;
  title: string;
  onClick: () => void;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-[11px] text-[#756f66] transition-colors hover:bg-[#f1eee8] hover:text-[#27231f] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#96734d] ${
        italic ? "italic" : ""
      } ${underline ? "underline" : ""} ${strike ? "line-through" : ""}`}
    >
      {label}
    </button>
  );
}

function EditorChangePlugin({ onChange }: { onChange?: (html: string) => void }) {
  return (
    <OnChangePlugin
      onChange={(editorState: EditorState, editor) => {
        if (!onChange) return;
        editorState.read(() => {
          onChange($generateHtmlFromNodes(editor));
        });
      }}
    />
  );
}

export default function NotesEditor({ initialContent, onChange }: NotesEditorProps) {
  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="overflow-hidden rounded-xl border border-[#e7e2da] bg-white shadow-[0_14px_36px_rgba(77,58,37,0.06)]">
        <EditorToolbar />
        <div className="relative">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className="notes-editor-content scrollbar-pill min-h-[330px] px-5 py-5 text-[15px] leading-7 text-[#3d3933] outline-none sm:px-7 sm:py-6"
                aria-label="Notes editor"
                aria-placeholder="Capture a thought, question, or source..."
                placeholder={<span aria-hidden />}
              />
            }
            placeholder={
              <div className="pointer-events-none absolute left-5 top-5 text-[15px] leading-7 text-[#aaa39a] sm:left-7 sm:top-6">
                Capture a thought, question, or source...
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
      </div>
      <HistoryPlugin />
      <ListPlugin />
      <InitialContentPlugin content={initialContent} />
      <EditorChangePlugin onChange={onChange} />
    </LexicalComposer>
  );
}
