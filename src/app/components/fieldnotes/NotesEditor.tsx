"use client";

import { $generateHtmlFromNodes, $generateNodesFromDOM } from "@lexical/html";
import { $createLinkNode, LinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListItemNode,
  ListNode,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
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
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
  PASTE_COMMAND,
  SELECTION_CHANGE_COMMAND,
  type LexicalEditor,
  type EditorState,
  mergeRegister,
} from "lexical";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

type BlockType = "paragraph" | "h1" | "h2" | "h3" | "callout";

const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  paragraph: "Text",
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  callout: "Callout",
};

/** Plain pasted text that should become a hyperlink. */
const PASTE_LINK_RE =
  /^(?:https?:\/\/|www\.)[^\s<>"']+$/i;

function isPasteableLink(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  if (PASTE_LINK_RE.test(trimmed)) return true;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizePasteLink(text: string): string {
  const trimmed = text.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

type SlashCommand = {
  id: string;
  /** Matched against text after `/` (e.g. h1, callout). */
  aliases: string[];
  label: string;
  hint: string;
  run: (editor: LexicalEditor) => void;
};

function applyBlockType(editor: LexicalEditor, nextType: BlockType) {
  editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    $setBlocksType(selection, () => {
      if (nextType === "callout") return $createCalloutNode();
      if (nextType === "paragraph") return $createParagraphNode();
      return $createHeadingNode(nextType);
    });
  });
}

function applyList(editor: LexicalEditor, kind: "ul" | "ol") {
  editor.dispatchCommand(
    kind === "ul" ? INSERT_UNORDERED_LIST_COMMAND : INSERT_ORDERED_LIST_COMMAND,
    undefined,
  );
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "paragraph",
    aliases: ["text", "paragraph", "p"],
    label: "Text",
    hint: "/text",
    run: (editor) => applyBlockType(editor, "paragraph"),
  },
  {
    id: "h1",
    aliases: ["h1", "heading1", "title"],
    label: "Heading 1",
    hint: "/h1",
    run: (editor) => applyBlockType(editor, "h1"),
  },
  {
    id: "h2",
    aliases: ["h2", "heading2"],
    label: "Heading 2",
    hint: "/h2",
    run: (editor) => applyBlockType(editor, "h2"),
  },
  {
    id: "h3",
    aliases: ["h3", "heading3"],
    label: "Heading 3",
    hint: "/h3",
    run: (editor) => applyBlockType(editor, "h3"),
  },
  {
    id: "callout",
    aliases: ["callout", "note", "aside"],
    label: "Callout",
    hint: "/callout",
    run: (editor) => applyBlockType(editor, "callout"),
  },
  {
    id: "ul",
    aliases: ["bullet", "bullets", "ul", "list"],
    label: "Bulleted list",
    hint: "/bullet",
    run: (editor) => applyList(editor, "ul"),
  },
  {
    id: "ol",
    aliases: ["number", "numbered", "ol", "ordered"],
    label: "Numbered list",
    hint: "/number",
    run: (editor) => applyList(editor, "ol"),
  },
];

function filterSlashCommands(query: string): SlashCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter(
    (command) =>
      command.aliases.some((alias) => alias.startsWith(q)) ||
      command.label.toLowerCase().includes(q),
  );
}

/** Returns the `/query` at the caret, if the slash menu should open. */
function $getSlashQuery(): { query: string; replaceFrom: number } | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;

  const anchor = selection.anchor;
  if (anchor.type !== "text") return null;
  const node = anchor.getNode();
  if (!$isTextNode(node)) return null;

  const textBefore = node.getTextContent().slice(0, anchor.offset);
  const match = textBefore.match(/(?:^|[\s\u00a0])(\/[a-z0-9]*)$/i);
  if (!match?.[1]) return null;

  return {
    query: match[1].slice(1),
    replaceFrom: anchor.offset - match[1].length,
  };
}

function $removeSlashTrigger(replaceFrom: number) {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;

  const anchor = selection.anchor;
  const node = anchor.getNode();
  if (!$isTextNode(node) || anchor.type !== "text") return;

  selection.setTextNodeRange(node, replaceFrom, node, anchor.offset);
  selection.removeText();
}

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

  const formatText = (
    format: "bold" | "italic" | "underline" | "strikethrough",
  ) => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
  };

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-[#e7e2da] px-4 py-2">
      <BlockTypeSelect />
      <span className="mx-1 h-5 w-px bg-[#e7e2da]" aria-hidden />
      <ToolbarButton label="B" title="Bold" onClick={() => formatText("bold")} />
      <ToolbarButton
        label="I"
        title="Italic"
        onClick={() => formatText("italic")}
        italic
      />
      <ToolbarButton
        label="U"
        title="Underline"
        onClick={() => formatText("underline")}
        underline
      />
      <ToolbarButton
        label="S"
        title="Strikethrough"
        onClick={() => formatText("strikethrough")}
        strike
      />
      <span className="mx-1 h-5 w-px bg-[#e7e2da]" aria-hidden />
      <ToolbarButton
        label="• list"
        title="Bulleted list"
        onClick={() => applyList(editor, "ul")}
      />
      <ToolbarButton
        label="1. list"
        title="Numbered list"
        onClick={() => applyList(editor, "ol")}
      />
    </div>
  );
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

  return (
    <label className="relative flex items-center">
      <span className="sr-only">Block type</span>
      <select
        aria-label="Block type"
        value={blockType}
        onChange={(event) =>
          applyBlockType(editor, event.target.value as BlockType)
        }
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

type SlashMenuState = {
  query: string;
  replaceFrom: number;
  left: number;
  top: number;
  selectedIndex: number;
};

function SlashCommandPlugin() {
  const [editor] = useLexicalComposerContext();
  const [menu, setMenu] = useState<SlashMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuStateRef = useRef<SlashMenuState | null>(null);
  menuStateRef.current = menu;

  const matches = menu ? filterSlashCommands(menu.query) : [];

  const runCommand = (command: SlashCommand, replaceFrom: number) => {
    menuStateRef.current = null;
    editor.update(() => {
      $removeSlashTrigger(replaceFrom);
    });
    command.run(editor);
    setMenu(null);
  };

  const confirmMenuCommand = (event: KeyboardEvent | null) => {
    const state = menuStateRef.current;
    if (!state) return false;
    const options = filterSlashCommands(state.query);
    const command = options[state.selectedIndex] ?? options[0];
    // Stop the browser / rich-text Enter from also inserting a paragraph.
    event?.preventDefault();
    if (!command) {
      setMenu(null);
      return true;
    }
    runCommand(command, state.replaceFrom);
    return true;
  };

  useEffect(() => {
    const syncMenu = () => {
      editor.getEditorState().read(() => {
        const slash = $getSlashQuery();
        if (!slash) {
          setMenu(null);
          return;
        }

        const native = window.getSelection();
        if (!native || native.rangeCount === 0) {
          setMenu(null);
          return;
        }
        const range = native.getRangeAt(0).cloneRange();
        const rect = range.getBoundingClientRect();
        const left = rect.left || 16;
        const top = (rect.bottom || 40) + 6;

        setMenu((current) => {
          const nextMatches = filterSlashCommands(slash.query);
          const nextIndex =
            current &&
            current.query === slash.query &&
            current.selectedIndex < nextMatches.length
              ? current.selectedIndex
              : 0;
          return {
            query: slash.query,
            replaceFrom: slash.replaceFrom,
            left,
            top,
            selectedIndex: nextIndex,
          };
        });
      });
    };

    return mergeRegister(
      editor.registerUpdateListener(() => {
        queueMicrotask(syncMenu);
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          queueMicrotask(syncMenu);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          if (!menuStateRef.current) return false;
          setMenu(null);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        (event) => {
          if (!menuStateRef.current) return false;
          event?.preventDefault();
          setMenu((current) => {
            if (!current) return current;
            const options = filterSlashCommands(current.query);
            if (options.length === 0) return current;
            return {
              ...current,
              selectedIndex: (current.selectedIndex + 1) % options.length,
            };
          });
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        (event) => {
          if (!menuStateRef.current) return false;
          event?.preventDefault();
          setMenu((current) => {
            if (!current) return current;
            const options = filterSlashCommands(current.query);
            if (options.length === 0) return current;
            return {
              ...current,
              selectedIndex:
                (current.selectedIndex - 1 + options.length) % options.length,
            };
          });
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => confirmMenuCommand(event),
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_TAB_COMMAND,
        (event) => confirmMenuCommand(event),
        COMMAND_PRIORITY_HIGH,
      ),
      // Safari/iOS may insert a paragraph via beforeinput even when Enter is handled.
      editor.registerCommand(
        INSERT_PARAGRAPH_COMMAND,
        () => Boolean(menuStateRef.current),
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [editor]);

  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const el = menuRef.current;
    const bounds = el.getBoundingClientRect();
    const pad = 8;
    let left = menu.left;
    let top = menu.top;
    if (left + bounds.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - bounds.width - pad);
    }
    if (top + bounds.height > window.innerHeight - pad) {
      top = Math.max(pad, menu.top - bounds.height - 12);
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [menu, matches.length]);

  if (!menu || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={menuRef}
      role="listbox"
      aria-label="Insert block"
      data-query={menu.query}
      data-selected-index={menu.selectedIndex}
      data-replace-from={menu.replaceFrom}
      className="fixed z-[80] w-[min(16.5rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-[#e2d9ce] bg-[#faf8f4] py-1.5 shadow-[0_16px_40px_rgba(48,36,24,0.16)]"
      style={{ left: menu.left, top: menu.top }}
    >
      <p className="px-3 pb-1.5 pt-1 font-space text-[8px] uppercase tracking-[0.16em] text-[#a09589]">
        Blocks
      </p>
      {matches.length === 0 ? (
        <p className="px-3 py-2 text-[12px] text-[#8a7c6d]">No matching block</p>
      ) : (
        matches.map((command, index) => {
          const selected = index === menu.selectedIndex;
          return (
            <button
              key={command.id}
              type="button"
              role="option"
              aria-selected={selected}
              onMouseDown={(event) => {
                event.preventDefault();
                runCommand(command, menu.replaceFrom);
              }}
              onMouseEnter={() =>
                setMenu((current) =>
                  current ? { ...current, selectedIndex: index } : current,
                )
              }
              className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors ${
                selected
                  ? "bg-[#efe8df] text-[#29241f]"
                  : "text-[#51463b] hover:bg-[#f3eee7]"
              }`}
            >
              <span className="text-[13px] leading-5">{command.label}</span>
              <span className="shrink-0 font-space text-[9px] uppercase tracking-[0.1em] text-[#9a8d7d]">
                {command.hint}
              </span>
            </button>
          );
        })
      )}
    </div>,
    document.body,
  );
}

function LinkPastePlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        if (!(event instanceof ClipboardEvent) || !event.clipboardData) {
          return false;
        }
        const raw = event.clipboardData.getData("text");
        if (!isPasteableLink(raw)) return false;

        const url = normalizePasteLink(raw);
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;

        event.preventDefault();

        if (!selection.isCollapsed()) {
          // Keep highlighted text as label; pasted URL becomes the href.
          editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
          return true;
        }

        // Bare URL paste → insert as a linked URL.
        editor.update(() => {
          const next = $getSelection();
          if (!$isRangeSelection(next) || !next.isCollapsed()) return;
          const linkNode = $createLinkNode(url, {
            rel: "noreferrer",
            target: "_blank",
          });
          linkNode.append($createTextNode(url));
          next.insertNodes([linkNode]);
        });
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor]);

  return null;
}

function EditorChangePlugin({
  onChange,
}: {
  onChange?: (html: string) => void;
}) {
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

export default function NotesEditor({
  initialContent,
  onChange,
}: NotesEditorProps) {
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
                aria-placeholder="Capture a thought, or type / for blocks..."
                placeholder={<span aria-hidden />}
              />
            }
            placeholder={
              <div className="pointer-events-none absolute left-5 top-5 text-[15px] leading-7 text-[#aaa39a] sm:left-7 sm:top-6">
                Capture a thought, or type / for blocks...
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
      </div>
      <HistoryPlugin />
      <ListPlugin />
      <LinkPlugin validateUrl={isPasteableLink} />
      <LinkPastePlugin />
      <SlashCommandPlugin />
      <InitialContentPlugin content={initialContent} />
      <EditorChangePlugin onChange={onChange} />
    </LexicalComposer>
  );
}
