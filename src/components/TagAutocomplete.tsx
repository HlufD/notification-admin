import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import type { Variable } from "../api/types";
import { TYPE_LABEL } from "../lib/format";
import { cx } from "./ui";

/** One suggestion after "{{". `insert` replaces the typed "{{…"; `caret` is where the cursor lands. */
export interface TagSuggestion {
  kind: "variable" | "if" | "keyword" | "snippet";
  label: string;
  insert: string;
  caret?: number;
  detail?: string;
  required?: boolean;
}

/** Suggestions for an event: variables (with .date/.time), {{#if}}, {{else}}, {{/if}}, snippets. */
export function buildSuggestions(variables: Variable[], snippetKeys: string[]): TagSuggestion[] {
  const vars = variables.flatMap((v): TagSuggestion[] => {
    const base: TagSuggestion = {
      kind: "variable",
      label: v.name,
      insert: `{{${v.name}}}`,
      detail: TYPE_LABEL[v.type],
      required: v.required,
    };
    if (v.type !== "datetime") return [base];
    return [
      base,
      { ...base, label: `${v.name}.date`, insert: `{{${v.name}.date}}`, detail: "Date only" },
      { ...base, label: `${v.name}.time`, insert: `{{${v.name}.time}}`, detail: "Time only" },
    ];
  });
  const ifs = variables.map((v): TagSuggestion => {
    const open = `{{#if ${v.name}}}`;
    return {
      kind: "if",
      label: `#if ${v.name}`,
      insert: `${open}{{/if}}`,
      caret: open.length,
      detail: v.required ? "Show if sent" : "Optional",
    };
  });
  const keywords: TagSuggestion[] = [
    { kind: "keyword", label: "else", insert: "{{else}}", detail: "Otherwise" },
    { kind: "keyword", label: "/if", insert: "{{/if}}", detail: "End if" },
  ];
  const snippets = snippetKeys.map((key): TagSuggestion => ({
    kind: "snippet",
    label: `> ${key}`,
    insert: `{{> ${key}}}`,
    detail: "Snippet",
  }));
  return [...vars, ...ifs, ...keywords, ...snippets];
}

const squash = (s: string) => s.replace(/\s+/g, "").toLowerCase();

function rank(items: TagSuggestion[], query: string): TagSuggestion[] {
  const q = squash(query);
  if (!q) return items.filter((i) => i.kind !== "if" || !i.detail?.startsWith("Show")).slice(0, 50);
  const scored = items
    .map((item) => {
      const label = squash(item.label);
      const bare = label.replace(/^#if|^>/, "");
      const score = label.startsWith(q) ? 0 : bare.startsWith(q) ? 1 : label.includes(q) ? 2 : -1;
      return { item, score };
    })
    .filter((x) => x.score >= 0);
  scored.sort((a, b) => a.score - b.score);
  return scored.map((x) => x.item).slice(0, 50);
}

// Mirror-div technique: where is the caret inside a textarea/input, in pixels?
const MIRRORED = [
  "box-sizing",
  "width",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "font-style",
  "font-variant",
  "font-weight",
  "font-stretch",
  "font-size",
  "line-height",
  "font-family",
  "text-align",
  "text-transform",
  "text-indent",
  "letter-spacing",
  "word-spacing",
  "tab-size",
  "word-break",
];

function caretRect(el: HTMLTextAreaElement | HTMLInputElement, position: number) {
  const style = getComputedStyle(el);
  const div = document.createElement("div");
  for (const prop of MIRRORED) div.style.setProperty(prop, style.getPropertyValue(prop));
  div.style.position = "absolute";
  div.style.visibility = "hidden";
  div.style.top = "0";
  div.style.left = "-9999px";
  div.style.whiteSpace = el instanceof HTMLInputElement ? "pre" : "pre-wrap";
  div.style.overflowWrap = "break-word";
  div.textContent = el.value.slice(0, position);
  const marker = document.createElement("span");
  marker.textContent = el.value.slice(position) || ".";
  div.appendChild(marker);
  document.body.appendChild(div);
  const box = el.getBoundingClientRect();
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4;
  const top = box.top + marker.offsetTop - el.scrollTop;
  const left = box.left + marker.offsetLeft - el.scrollLeft;
  div.remove();
  return { top: top + lineHeight, left };
}

interface MenuState {
  query: string;
  start: number;
  caret: number;
  top: number;
  left: number;
}

const MENU_WIDTH = 300;

/**
 * Autocomplete for template tags: typing "{{" (optionally followed by part of a name,
 * "#if", "/" or ">") opens a menu of matching tags. ↑/↓ choose, Enter/Tab insert, Esc closes.
 */
export function useTagAutocomplete<T extends HTMLTextAreaElement | HTMLInputElement>({
  ref,
  onChange,
  suggestions,
}: {
  ref: RefObject<T | null>;
  onChange: (value: string) => void;
  suggestions: TagSuggestion[];
}) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [index, setIndex] = useState(0);
  const dismissedAt = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => (menu ? rank(suggestions, menu.query) : []), [menu, suggestions]);
  const open = menu !== null && items.length > 0;

  /** Re-reads the caret and decides whether the menu should be open. */
  const refresh = () => {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? 0;
    if (caret !== el.selectionEnd) return setMenu(null);
    const match = /\{\{([^{}\n]{0,40})$/.exec(el.value.slice(0, caret));
    if (!match) {
      dismissedAt.current = null;
      return setMenu(null);
    }
    const start = caret - match[0].length;
    if (dismissedAt.current === start) return setMenu(null);
    const pos = caretRect(el, start);
    setMenu({
      query: match[1],
      start,
      caret,
      top: pos.top + 4,
      left: Math.max(8, Math.min(pos.left, window.innerWidth - MENU_WIDTH - 8)),
    });
  };

  const accept = (item: TagSuggestion) => {
    const el = ref.current;
    if (!el || !menu) return;
    const value = el.value;
    let end = menu.caret;
    if (value.slice(end).startsWith("}}")) end += 2; // don't leave a dangling "}}"
    const next = value.slice(0, menu.start) + item.insert + value.slice(end);
    const caret = menu.start + (item.caret ?? item.insert.length);
    onChange(next);
    setMenu(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  const onKeyDown = (e: KeyboardEvent<T>) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      accept(items[Math.min(index, items.length - 1)]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      dismissedAt.current = menu.start;
      setMenu(null);
    }
  };

  const onKeyUp = (e: KeyboardEvent<T>) => {
    if (!["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(e.key) || !open) refresh();
  };

  // A new query starts at the best match.
  useEffect(() => setIndex(0), [menu?.start, menu?.query]);

  // Keep the active row visible; close when the page scrolls (the menu is fixed-positioned).
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [index, open]);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu !== null]);

  const element: ReactNode = open ? (
    <div
      role="listbox"
      className="fixed z-50 flex flex-col overflow-hidden rounded-md border border-outline-variant bg-surface-container-lowest shadow-xl"
      style={{ top: menu.top, left: menu.left, width: MENU_WIDTH }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div ref={listRef} className="max-h-64 overflow-y-auto py-1">
        {items.map((item, i) => (
          <button
            key={`${item.kind}-${item.label}`}
            type="button"
            role="option"
            aria-selected={i === index}
            data-index={i}
            onMouseEnter={() => setIndex(i)}
            onClick={() => accept(item)}
            className={cx(
              "flex w-full items-center gap-2 px-2.5 py-1.5 text-left",
              i === index ? "bg-secondary-fixed" : "hover:bg-surface-container-low",
            )}
          >
            <KindBadge kind={item.kind} />
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-primary">
              {item.label}
            </span>
            {item.required && (
              <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-error" title="Required" />
            )}
            {item.detail && (
              <span className="flex-shrink-0 font-mono text-[10px] text-on-surface-variant">
                {item.detail}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="border-t border-outline-variant/40 bg-surface-container-low px-2.5 py-1 text-[10px] text-on-surface-variant">
        ↑↓ choose · Enter or Tab insert · Esc close
      </div>
    </div>
  ) : null;

  return {
    menu: element,
    handlers: {
      onKeyDown,
      onKeyUp,
      onClick: refresh,
      onBlur: () => setMenu(null),
    },
    /** Call after the value changes from typing, so the menu follows the text. */
    refresh: () => requestAnimationFrame(refresh),
  };
}

function KindBadge({ kind }: { kind: TagSuggestion["kind"] }) {
  const map = {
    variable: ["VAR", "bg-surface-container-high text-primary"],
    if: ["IF", "bg-primary text-on-primary"],
    keyword: ["KEY", "bg-surface-container text-on-surface-variant"],
    snippet: ["SNIP", "bg-primary-container text-on-primary-container"],
  } as const;
  const [text, style] = map[kind];
  return (
    <span
      className={cx(
        "w-9 flex-shrink-0 rounded-sm py-px text-center font-mono text-[9px] font-semibold",
        style,
      )}
    >
      {text}
    </span>
  );
}
