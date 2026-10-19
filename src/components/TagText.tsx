import { Fragment } from "react";

/** Matches the five valid tags; used for highlighting only (the server checks the text). */
const TAG =
  /\{\{\s*(?:#if\s+[a-zA-Z][a-zA-Z0-9]*|else|\/if|>\s*[a-zA-Z][a-zA-Z0-9]*|[a-zA-Z][a-zA-Z0-9]*(?:\.(?:date|time))?)\s*\}\}/g;

/** Template text with its tags shown as pills. */
export function TagText({ text }: { text: string }) {
  const parts: Array<{ tag: boolean; value: string }> = [];
  let last = 0;
  for (const m of text.matchAll(TAG)) {
    if (m.index > last) parts.push({ tag: false, value: text.slice(last, m.index) });
    parts.push({ tag: true, value: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ tag: false, value: text.slice(last) });

  return (
    <>
      {parts.map((p, i) =>
        p.tag ? (
          <span key={i} className="rounded bg-secondary-fixed px-1 font-mono text-primary">
            {p.value}
          </span>
        ) : (
          <Fragment key={i}>{p.value}</Fragment>
        ),
      )}
    </>
  );
}
