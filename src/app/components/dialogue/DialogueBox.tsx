"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { Presentable, State } from "@/lib/dialogue";
import type { DialogueTheme } from "./theme";
import {
  TypewriterLine,
  useTypewriter,
  useTypingGate,
  type TypingGateRef,
} from "./typewriter";

function humanizeStatKey(key: string): string {
  return key
    .split(/[_.]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Dialogue body text sizes (16px root: 1rem = 16px) */
const FONT_SIZE_MD = "1.2rem";
const FONT_SIZE_LG = "1.65rem";

export type DialogueBoxSize = "md" | "lg";

export type DialogueEditableChoice = {
  /** Empty/whitespace → render only the input (free-text option, no label copy). */
  label: string;
  value: string;
  placeholder?: string;
  selectOptions?: readonly string[];
  selectPlaceholder?: string;
  autocompleteOptions?: readonly string[];
  onChange: (value: string) => void;
  onSubmit: () => void;
  onSelectOption?: (value: string) => void;
};

/** A fixed-looking choice that expands into a reusable dropdown on activation. */
export type DialogueDropdownChoice = {
  label: string;
  options: readonly string[];
  value?: string;
  placeholder?: string;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (value: string) => void;
};

const FONT_SIZE: Record<DialogueBoxSize, string> = {
  md: FONT_SIZE_MD,
  lg: FONT_SIZE_LG,
};

type DialogueBoxProps = {
  view: Presentable;
  theme: DialogueTheme;
  typingGateRef: TypingGateRef;
  onAdvance: () => void;
  onChoose: (index: number) => void;
  onRestart: () => void;
  /** Body text size. Default `lg`. */
  size?: DialogueBoxSize;
  /**
   * When false, digit quick-keys do not select choices (e.g. story under an
   * overlay that owns keyboard). Default true.
   */
  keyboardEnabled?: boolean;
  /** When false, choice prompts appear instantly (no typewriter). Default true. */
  typingEnabled?: boolean;
  onTypingChange?: (done: boolean) => void;
  /** Render inline markdown (`**bold**`, `_italic_`); HTML tags stay literal. */
  richText?: boolean;
  editableChoice?: DialogueEditableChoice;
  dropdownChoice?: DialogueDropdownChoice;
};

function isEditingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)
  );
}

/** Map Digit/Numpad 1–9 to a 0-based choice order, or null if not a quick-key. */
function choiceOrderFromDigitKey(key: string, code: string): number | null {
  if (key.length === 1 && key >= "1" && key <= "9") {
    return Number(key) - 1;
  }
  const numpad = /^Numpad([1-9])$/.exec(code);
  if (numpad) return Number(numpad[1]) - 1;
  return null;
}

export function dialogueContinueHint(
  view: Presentable,
  typingDone: boolean,
): string | null {
  if (view.kind !== "text") return null;
  if (typingDone && view.canAdvance) return "Continue — space";
  if (!typingDone) return "Skip to end — space";
  return null;
}

export function DialogueBox({
  view,
  theme,
  typingGateRef,
  onAdvance,
  onChoose,
  onRestart,
  size = "lg",
  keyboardEnabled = true,
  typingEnabled = true,
  onTypingChange,
  richText = false,
  editableChoice,
  dropdownChoice,
}: DialogueBoxProps) {
  if (view.kind === "text") {
    return (
      <TextBeat
        speaker={view.speaker}
        text={view.text}
        theme={theme}
        size={size}
        richText={richText}
        onContinue={() => {
          if (!typingGateRef.current.done) {
            typingGateRef.current.skip();
            return;
          }
          onAdvance();
        }}
        typingGateRef={typingGateRef}
        onTypingChange={onTypingChange}
      />
    );
  }

  if (view.kind === "choice") {
    return (
      <ChoiceBeat
        prompt={view.prompt}
        choices={view.choices}
        theme={theme}
        size={size}
        richText={richText}
        onChoose={onChoose}
        typingGateRef={typingGateRef}
        keyboardEnabled={keyboardEnabled}
        typingEnabled={typingEnabled}
        onTypingChange={onTypingChange}
        editableChoice={editableChoice}
        dropdownChoice={dropdownChoice}
      />
    );
  }

  return (
    <EndBeat
      title={view.title}
      text={view.text}
      state={view.state}
      showStats={view.showStats}
      theme={theme}
      size={size}
      richText={richText}
      onRestart={onRestart}
      typingGateRef={typingGateRef}
    />
  );
}

function bodyFontStyle(size: DialogueBoxSize): CSSProperties {
  return { fontSize: FONT_SIZE[size] };
}

/** Secondary copy (choices, end body) — only override when `md`. */
function secondaryFontStyle(size: DialogueBoxSize): CSSProperties | undefined {
  return size === "md" ? { fontSize: FONT_SIZE_MD } : undefined;
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

function closestAutocompleteOption(
  value: string,
  options: readonly string[] | undefined,
): string | undefined {
  const query = value.trim().toLocaleLowerCase();
  if (!query || !options?.length) return undefined;
  return options
    .map((option, index) => {
      const normalized = option.toLocaleLowerCase();
      const startsWith = normalized.startsWith(query);
      const includes = normalized.includes(query);
      return {
        option,
        index,
        score: startsWith
          ? normalized.length - query.length
          : includes
            ? 100 + normalized.indexOf(query)
            : 1000 + editDistance(query, normalized),
      };
    })
    .sort((left, right) => left.score - right.score || left.index - right.index)[0]
    ?.option;
}

function TextBeat({
  speaker,
  text,
  onContinue,
  typingGateRef,
  theme,
  size,
  richText = false,
  onTypingChange,
}: {
  speaker?: string;
  text: string;
  onContinue: () => void;
  typingGateRef: TypingGateRef;
  theme: DialogueTheme;
  size: DialogueBoxSize;
  richText?: boolean;
  onTypingChange?: (done: boolean) => void;
}) {
  const { displayed, visibleLength, done, skip } = useTypewriter(
    text,
    true,
    richText,
  );
  useTypingGate(typingGateRef, done, skip);
  useEffect(() => {
    onTypingChange?.(done);
  }, [done, onTypingChange]);

  return (
    <button
      type="button"
      onClick={onContinue}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") {
          // Handled by the capture-phase window listener — avoid double fire.
          event.preventDefault();
        }
      }}
      className="group flex flex-col items-stretch text-left outline-none"
    >
      {speaker ? <p className={theme.speaker}>{speaker}</p> : null}
      <TypewriterLine
        text={text}
        displayed={displayed}
        visibleLength={visibleLength}
        done={done}
        className={theme.body}
        style={bodyFontStyle(size)}
        theme={theme}
        richText={richText}
      />
    </button>
  );
}

function ChoiceBeat({
  prompt,
  choices,
  onChoose,
  typingGateRef,
  keyboardEnabled = true,
  typingEnabled = true,
  onTypingChange,
  theme,
  size,
  richText = false,
  editableChoice,
  dropdownChoice,
}: {
  prompt?: string;
  choices: Array<{ index: number; label: string }>;
  onChoose: (index: number) => void;
  typingGateRef: TypingGateRef;
  keyboardEnabled?: boolean;
  typingEnabled?: boolean;
  onTypingChange?: (done: boolean) => void;
  theme: DialogueTheme;
  size: DialogueBoxSize;
  richText?: boolean;
  editableChoice?: DialogueEditableChoice;
  dropdownChoice?: DialogueDropdownChoice;
}) {
  const promptText = prompt ?? "What do you do?";
  const { displayed, visibleLength, done, skip } = useTypewriter(
    promptText,
    typingEnabled,
    richText,
  );
  useTypingGate(typingGateRef, done, skip);
  useEffect(() => {
    onTypingChange?.(done);
  }, [done, onTypingChange]);
  const listRef = useRef<HTMLUListElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const choicesKey = choices.map((choice) => choice.index).join(",");
  const hasEditableChoice = editableChoice !== undefined;
  const hasDropdownChoice = dropdownChoice !== undefined;
  const hasComplexChoice = hasEditableChoice || hasDropdownChoice;
  const optionCount = choices.length + (hasComplexChoice ? 1 : 0);
  const showChoiceIndex = optionCount > 1;
  const [focusReset, setFocusReset] = useState({ done, choicesKey });

  if (done !== focusReset.done || choicesKey !== focusReset.choicesKey) {
    setFocusReset({ done, choicesKey });
    if (done && (choices.length > 0 || hasComplexChoice)) {
      setActiveIndex(0);
    }
  }

  useEffect(() => {
    if (!done || (choices.length === 0 && !hasComplexChoice)) return;
    const id = window.requestAnimationFrame(() => {
      const first = listRef.current?.querySelector<HTMLButtonElement>(
        '[data-choice-index="0"]',
      );
      if (first) {
        first.focus();
      } else {
        listRef.current
          ?.querySelector<HTMLElement>(
            "[data-editable-choice-select], [data-editable-choice], [data-dropdown-choice-select]",
          )
          ?.focus();
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [done, choices.length, choicesKey, hasComplexChoice]);

  const focusChoice = (order: number) => {
    const total = choices.length + (hasComplexChoice ? 1 : 0);
    if (total === 0) return;
    const wrapped = (order + total) % total;
    setActiveIndex(wrapped);
    if (wrapped === choices.length && hasComplexChoice) {
      listRef.current
        ?.querySelector<HTMLElement>(
          "[data-editable-choice-select], [data-editable-choice], [data-dropdown-choice-select]",
        )
        ?.focus();
      return;
    }
    listRef.current?.querySelector<HTMLButtonElement>(
      `[data-choice-index="${wrapped}"]`,
    )?.focus();
  };

  const activateChoiceByOrder = useEffectEvent((order: number) => {
    const total = choices.length + (hasComplexChoice ? 1 : 0);
    if (order < 0 || order >= total) return false;
    if (order < choices.length) {
      onChoose(choices[order].index);
      return true;
    }
    // Complex free-text / dropdown slot: focus it (do not auto-submit).
    focusChoice(order);
    return true;
  });

  // Digit 1–9 quick-select: same labels shown beside each option. Capture-phase
  // so it works even when focus is on the document body (not the listbox).
  useEffect(() => {
    if (!done || !keyboardEnabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditingTarget(event.target)) return;

      const order = choiceOrderFromDigitKey(event.key, event.code);
      if (order === null) return;
      if (!activateChoiceByOrder(order)) return;

      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [done, keyboardEnabled]);

  const onListKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>) => {
    if (event.defaultPrevented) return;

    const target = event.target;
    const inFreeText = target instanceof HTMLInputElement;
    const inSelect = target instanceof HTMLSelectElement;

    // Free-text: arrows still move between choices. Leave Left/Right for the
    // caret unless the cursor is already at the matching edge.
    if (inFreeText) {
      const atStart =
        target.selectionStart === 0 && target.selectionEnd === 0;
      const atEnd =
        target.selectionStart === target.value.length &&
        target.selectionEnd === target.value.length;
      if (
        event.key === "ArrowDown" ||
        (event.key === "ArrowRight" && atEnd)
      ) {
        event.preventDefault();
        focusChoice(activeIndex + 1);
        return;
      }
      if (
        event.key === "ArrowUp" ||
        (event.key === "ArrowLeft" && atStart)
      ) {
        event.preventDefault();
        focusChoice(activeIndex - 1);
        return;
      }
      if (event.key !== "Tab") return;
    } else if (inSelect && event.key !== "Tab") {
      // Keep native select Up/Down cycling; Tab still moves between choices.
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      focusChoice(activeIndex + (event.shiftKey ? -1 : 1));
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      focusChoice(activeIndex + 1);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      focusChoice(activeIndex - 1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      focusChoice(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      focusChoice(choices.length + (hasComplexChoice ? 0 : -1));
    }
  };

  return (
    <div className="flex flex-col">
      <button
        type="button"
        tabIndex={done ? -1 : 0}
        onClick={() => {
          if (!done) skip();
        }}
        className="mb-8 text-left outline-none"
        aria-label={promptText}
      >
        <TypewriterLine
          text={promptText}
          displayed={displayed}
          visibleLength={visibleLength}
          done={done}
          className={theme.body}
          style={bodyFontStyle(size)}
          theme={theme}
          richText={richText}
        />
      </button>
      {done ? (
        <ul
          ref={listRef}
          role="listbox"
          aria-label="Choices"
          onKeyDown={onListKeyDown}
          className="mt-auto flex flex-col gap-2"
        >
          {choices.map((choice, order) => {
            const selected = order === activeIndex;
            return (
              <li
                key={choice.index}
                className="choice-cascade-item"
                style={{ ["--cascade-i" as string]: order }}
                role="none"
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-choice-index={order}
                  tabIndex={selected ? 0 : -1}
                  onFocus={() => setActiveIndex(order)}
                  onClick={() => onChoose(choice.index)}
                  className={`group flex w-full items-start rounded-sm px-4 py-4 text-left outline-none transition-colors duration-300 ease-out ${
                    showChoiceIndex ? "gap-5" : ""
                  } ${selected ? theme.choiceSelected : theme.choiceIdle}`}
                >
                  {showChoiceIndex ? (
                    <span
                      className={`mt-0.5 w-6 shrink-0 text-[12px] tabular-nums tracking-[0.12em] transition-colors duration-300 ${
                        selected ? theme.choiceIndexSelected : theme.choiceIndex
                      }`}
                    >
                      {String(order + 1).padStart(2, "0")}
                    </span>
                  ) : null}
                  <span
                    className={`text-[1.05rem] leading-snug transition-colors duration-300 sm:text-[1.125rem] ${
                      selected ? theme.choiceLabelSelected : theme.choiceLabel
                    }`}
                    style={secondaryFontStyle(size)}
                  >
                    {choice.label}
                  </span>
                </button>
              </li>
            );
          })}
          {editableChoice ? (
            <li className="choice-cascade-item" style={{ ["--cascade-i" as string]: choices.length }} role="none">
              <label
                role="option"
                aria-selected={activeIndex === choices.length}
                data-editable-choice-option
                tabIndex={activeIndex === choices.length ? 0 : -1}
                onFocus={() => setActiveIndex(choices.length)}
                className={`group flex w-full items-start rounded-sm px-4 py-4 text-left outline-none transition-colors duration-300 ease-out ${
                  showChoiceIndex ? "gap-5" : ""
                } ${activeIndex === choices.length ? theme.choiceSelected : theme.choiceIdle}`}
              >
                {showChoiceIndex ? (
                  <span className={`mt-0.5 w-6 shrink-0 text-[12px] tabular-nums tracking-[0.12em] ${activeIndex === choices.length ? theme.choiceIndexSelected : theme.choiceIndex}`}>
                    {String(choices.length + 1).padStart(2, "0")}
                  </span>
                ) : null}
                <span className={`min-w-0 flex-1 text-[1.05rem] leading-snug ${theme.choiceLabel}`} style={secondaryFontStyle(size)}>
                  {editableChoice.label.trim() ? (
                    <span className="block">{editableChoice.label}</span>
                  ) : null}
                  {editableChoice.selectOptions?.length ? (
                    <select
                      data-editable-choice-select
                      value={editableChoice.selectOptions.includes(editableChoice.value) ? editableChoice.value : ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        editableChoice.onChange(value);
                        editableChoice.onSelectOption?.(value);
                      }}
                      onFocus={() => setActiveIndex(choices.length)}
                      onKeyDown={(event) => {
                        if (event.key !== "Escape") return;
                        event.preventDefault();
                        event.stopPropagation();
                        event.currentTarget.blur();
                        setActiveIndex(choices.length);
                        window.requestAnimationFrame(() => {
                          listRef.current
                            ?.querySelector<HTMLElement>("[data-editable-choice-option]")
                            ?.focus();
                        });
                      }}
                      aria-label={`${editableChoice.label || editableChoice.placeholder} dropdown`}
                      className="mt-2 w-full border-b border-current/30 bg-transparent pb-1 text-[1.05rem] leading-snug text-current outline-none focus:border-current sm:text-[1.125rem]"
                    >
                      <option value="" disabled>
                        {editableChoice.selectPlaceholder ?? "choose one…"}
                      </option>
                      {editableChoice.selectOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <div
                    className={`relative ${
                      editableChoice.label.trim() || editableChoice.selectOptions?.length
                        ? "mt-2"
                        : ""
                    }`}
                  >
                    <input
                      type="text"
                      data-editable-choice
                      value={editableChoice.value}
                      onChange={(event) => editableChoice.onChange(event.target.value)}
                      onFocus={() => setActiveIndex(choices.length)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          event.stopPropagation();
                          event.currentTarget.blur();
                          // Leave the free-text option selected; do not jump to choice 0
                          // or close the dialogue layer.
                          setActiveIndex(choices.length);
                          window.requestAnimationFrame(() => {
                            listRef.current
                              ?.querySelector<HTMLElement>("[data-editable-choice-option]")
                              ?.focus();
                          });
                          return;
                        }
                        const suggestion = closestAutocompleteOption(
                          editableChoice.value,
                          editableChoice.autocompleteOptions,
                        );
                        if (
                          event.key === "Tab" &&
                          suggestion &&
                          suggestion.toLocaleLowerCase() !== editableChoice.value.trim().toLocaleLowerCase()
                        ) {
                          event.preventDefault();
                          editableChoice.onChange(suggestion);
                          return;
                        }
                        if (event.key === "Enter") {
                          event.preventDefault();
                          editableChoice.onSubmit();
                        }
                      }}
                      placeholder={editableChoice.placeholder}
                      aria-label={editableChoice.label || editableChoice.placeholder}
                      className="w-full border-b border-current/30 bg-transparent pb-1 text-[1.05rem] leading-snug text-current outline-none placeholder:text-current/35 focus:border-current sm:text-[1.125rem]"
                    />
                    {(() => {
                      const suggestion = closestAutocompleteOption(
                        editableChoice.value,
                        editableChoice.autocompleteOptions,
                      );
                      return suggestion && suggestion.toLocaleLowerCase() !== editableChoice.value.trim().toLocaleLowerCase() ? (
                        <span className="pointer-events-none absolute right-0 top-full mt-1 text-[0.7rem] text-current/45">
                          Tab ↹ {suggestion}
                        </span>
                      ) : null;
                    })()}
                  </div>
                </span>
              </label>
            </li>
          ) : null}
          {dropdownChoice ? (
            <li className="choice-cascade-item" style={{ ["--cascade-i" as string]: choices.length }} role="none">
              <div
                role="option"
                aria-selected={activeIndex === choices.length}
                tabIndex={activeIndex === choices.length ? 0 : -1}
                onFocus={() => setActiveIndex(choices.length)}
                onClick={dropdownChoice.onToggle}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    dropdownChoice.onToggle();
                  }
                }}
                className={`group flex w-full items-start rounded-sm px-4 py-4 text-left outline-none transition-colors duration-300 ease-out ${
                  showChoiceIndex ? "gap-5" : ""
                } ${activeIndex === choices.length ? theme.choiceSelected : theme.choiceIdle}`}
              >
                {showChoiceIndex ? (
                  <span className={`mt-0.5 w-6 shrink-0 text-[12px] tabular-nums tracking-[0.12em] ${activeIndex === choices.length ? theme.choiceIndexSelected : theme.choiceIndex}`}>
                    {String(choices.length + 1).padStart(2, "0")}
                  </span>
                ) : null}
                <span className={`min-w-0 flex-1 text-[1.05rem] leading-snug ${activeIndex === choices.length ? theme.choiceLabelSelected : theme.choiceLabel}`} style={secondaryFontStyle(size)}>
                  <span className="block">{dropdownChoice.label}</span>
                  {dropdownChoice.expanded ? (
                    <select
                      data-dropdown-choice-select
                      autoFocus
                      value={dropdownChoice.options.includes(dropdownChoice.value ?? "") ? dropdownChoice.value : ""}
                      onChange={(event) => {
                        const value = event.target.value.trim();
                        if (!value || !dropdownChoice.options.includes(value)) return;
                        dropdownChoice.onSelect(value);
                      }}
                      onClick={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.stopPropagation()}
                      onFocus={() => setActiveIndex(choices.length)}
                      aria-label={`${dropdownChoice.label} dropdown`}
                      className="mt-2 w-full border-b border-current/30 bg-transparent pb-1 text-[1.05rem] leading-snug text-current outline-none focus:border-current sm:text-[1.125rem]"
                    >
                      <option value="" disabled>
                        {dropdownChoice.placeholder ?? "choose one…"}
                      </option>
                      {dropdownChoice.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </span>
              </div>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

function EndBeat({
  title,
  text,
  state,
  showStats,
  onRestart,
  typingGateRef,
  theme,
  size,
  richText = false,
}: {
  title: string;
  text: string;
  state: State;
  showStats: boolean;
  onRestart: () => void;
  typingGateRef: TypingGateRef;
  theme: DialogueTheme;
  size: DialogueBoxSize;
  richText?: boolean;
}) {
  const { displayed, visibleLength, done, skip } = useTypewriter(
    text,
    true,
    richText,
  );
  useTypingGate(typingGateRef, done, skip);

  return (
    <div className="flex flex-col">
      <p className={theme.eyebrow}>Ending</p>
      <h2 className={theme.heading} style={secondaryFontStyle(size)}>
        {title}
      </h2>
      <button
        type="button"
        onClick={() => {
          if (!done) skip();
        }}
        className="mt-6 text-left outline-none"
        aria-label={text}
      >
        <TypewriterLine
          text={text}
          displayed={displayed}
          visibleLength={visibleLength}
          done={done}
          className={theme.bodyMuted}
          style={secondaryFontStyle(size)}
          theme={theme}
          caretTone="muted"
          richText={richText}
        />
      </button>
      {done ? (
        <>
          {showStats ? (
            <dl className={theme.endStatRule}>
              {Object.entries(state.stats).map(([key, value]) => (
                <div key={key}>
                  <dt className={theme.endStatLabel}>{humanizeStatKey(key)}</dt>
                  <dd className={theme.endStatValue}>{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <button type="button" onClick={onRestart} className={theme.restart}>
            Begin again
          </button>
        </>
      ) : null}
    </div>
  );
}
