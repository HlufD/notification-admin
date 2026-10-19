/**
 * In-browser stand-in for the service's template engine: parses the five tags, checks a
 * template against an event's variables and the snippets, and renders it with values.
 */
import type { CheckInfo, Issue, SmsLength, Variable, VariableType } from "../api/types";

type Node =
  | { kind: "text"; text: string }
  | { kind: "var"; name: string; part?: "date" | "time" }
  | { kind: "if"; name: string; then: Node[]; otherwise: Node[] }
  | { kind: "snippet"; key: string };

const NAME = "[a-zA-Z][a-zA-Z0-9]*";
const IF_RE = new RegExp(`^#if\\s+(${NAME})$`);
const SNIPPET_RE = new RegExp(`^>\\s*(${NAME})$`);
const VAR_RE = new RegExp(`^(${NAME})(?:\\.(date|time))?$`);

/** Parses text into a tree; structural problems are returned as issues at `location`. */
export function parse(text: string, location: string): { nodes: Node[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const issue = (code: Issue["code"], message: string) => issues.push({ code, message, location });

  type Frame = { name: string; then: Node[]; otherwise: Node[]; inElse: boolean };
  const root: Node[] = [];
  const stack: Frame[] = [];
  const target = (): Node[] => {
    const top = stack[stack.length - 1];
    return top ? (top.inElse ? top.otherwise : top.then) : root;
  };
  const pushText = (t: string) => {
    if (!t) return;
    const nodes = target();
    const last = nodes[nodes.length - 1];
    if (last?.kind === "text") last.text += t;
    else nodes.push({ kind: "text", text: t });
  };

  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("{{", i);
    const close = text.indexOf("}}", i);
    if (close !== -1 && (open === -1 || close < open)) {
      issue("STRAY_CLOSE", `"}}" without a matching "{{".`);
      pushText(text.slice(i, close + 2));
      i = close + 2;
      continue;
    }
    if (open === -1) {
      pushText(text.slice(i));
      break;
    }
    pushText(text.slice(i, open));
    const end = text.indexOf("}}", open + 2);
    const nextOpen = text.indexOf("{{", open + 2);
    if (end === -1 || (nextOpen !== -1 && nextOpen < end)) {
      issue("UNCLOSED_TAG", `"{{" is never closed with "}}".`);
      pushText("{{");
      i = open + 2;
      continue;
    }
    const raw = text.slice(open, end + 2);
    const inner = text.slice(open + 2, end).trim();
    i = end + 2;

    let m: RegExpExecArray | null;
    if ((m = IF_RE.exec(inner))) {
      const frame: Frame = { name: m[1], then: [], otherwise: [], inElse: false };
      target().push({ kind: "if", name: frame.name, then: frame.then, otherwise: frame.otherwise });
      stack.push(frame);
    } else if (inner === "else") {
      const top = stack[stack.length - 1];
      if (!top) issue("STRAY_ELSE", `{{else}} outside an {{#if}}.`);
      else if (top.inElse)
        issue("DUPLICATE_ELSE", `{{#if ${top.name}}} has more than one {{else}}.`);
      else top.inElse = true;
    } else if (inner === "/if") {
      if (!stack.pop()) issue("STRAY_END_IF", `{{/if}} without a matching {{#if}}.`);
    } else if ((m = SNIPPET_RE.exec(inner))) {
      target().push({ kind: "snippet", key: m[1] });
    } else if ((m = VAR_RE.exec(inner))) {
      target().push({ kind: "var", name: m[1], part: m[2] as "date" | "time" | undefined });
    } else {
      issue("INVALID_TAG", `${raw} is not a valid tag.`);
    }
  }
  for (const frame of stack)
    issue("UNCLOSED_IF", `{{#if ${frame.name}}} is never closed with {{/if}}.`);
  return { nodes: root, issues };
}

function* walk(nodes: Node[]): Generator<Node> {
  for (const n of nodes) {
    yield n;
    if (n.kind === "if") {
      yield* walk(n.then);
      yield* walk(n.otherwise);
    }
  }
}

/** Snippet checks that don't depend on an event: structure, no nested snippets. */
export function checkSnippet(body: string): Issue[] {
  if (!body.trim())
    return [{ code: "EMPTY_BODY", message: "The snippet is empty.", location: "body" }];
  const { nodes, issues } = parse(body, "body");
  for (const n of walk(nodes)) {
    if (n.kind === "snippet")
      issues.push({
        code: "NESTED_SNIPPET",
        message: `Snippets can't include other snippets ({{> ${n.key}}}).`,
        location: "body",
      });
  }
  return issues;
}

export interface CheckInput {
  channel: string;
  subject?: string | null;
  body: string;
  variables: Variable[];
  snippets: Map<string, string>;
}

export interface CheckResult {
  errors: Issue[];
  /** Variables referenced anywhere, snippets included. */
  used: Set<string>;
  subjectNodes: Node[] | null;
  bodyNodes: Node[];
}

/** Every save-blocking problem of a template for one event. */
export function check(input: CheckInput): CheckResult {
  const vars = new Map(input.variables.map((v) => [v.name, v]));
  const errors: Issue[] = [];
  const used = new Set<string>();
  const usesSubject = input.channel !== "sms";
  const parsedSnippets = new Map<string, Node[] | null>();

  const visit = (nodes: Node[], location: string, inSnippet: boolean) => {
    for (const n of walk(nodes)) {
      if (n.kind === "var" || n.kind === "if") {
        used.add(n.name);
        const v = vars.get(n.name);
        if (!v)
          errors.push({
            code: "UNKNOWN_VARIABLE",
            message: `{{${n.name}}} is not a variable of this event.`,
            location,
          });
        else if (n.kind === "var" && n.part && v.type !== "datetime")
          errors.push({
            code: "DATE_PART_NOT_DATETIME",
            message: `{{${n.name}.${n.part}}}: .${n.part} only works on datetime variables.`,
            location,
          });
      } else if (n.kind === "snippet") {
        if (inSnippet) {
          errors.push({
            code: "NESTED_SNIPPET",
            message: `Snippets can't include other snippets ({{> ${n.key}}}).`,
            location,
          });
          continue;
        }
        const body = input.snippets.get(n.key);
        if (body === undefined) {
          errors.push({
            code: "UNKNOWN_SNIPPET",
            message: `There is no snippet called ${n.key}.`,
            location,
          });
          continue;
        }
        if (!parsedSnippets.has(n.key)) {
          const parsed = parse(body, `snippet ${n.key}`);
          if (parsed.issues.length) {
            errors.push({
              code: "BROKEN_SNIPPET",
              message: `Snippet ${n.key} has errors: ${parsed.issues[0].message}`,
              location: `snippet ${n.key}`,
            });
            parsedSnippets.set(n.key, null);
          } else {
            parsedSnippets.set(n.key, parsed.nodes);
            visit(parsed.nodes, `snippet ${n.key}`, true);
          }
        }
      }
    }
  };

  let subjectNodes: Node[] | null = null;
  if (usesSubject) {
    const subject = input.subject ?? "";
    if (!subject.trim())
      errors.push({
        code: "MISSING_SUBJECT",
        message:
          input.channel === "email"
            ? "An email needs a subject."
            : "An in-app message needs a title.",
        location: "subject",
      });
    const parsed = parse(subject, "subject");
    errors.push(...parsed.issues);
    visit(parsed.nodes, "subject", false);
    subjectNodes = parsed.nodes;
  }
  if (!input.body.trim())
    errors.push({ code: "EMPTY_BODY", message: "The message body is empty.", location: "body" });
  const parsed = parse(input.body, "body");
  errors.push(...parsed.issues);
  visit(parsed.nodes, "body", false);

  return { errors, used, subjectNodes, bodyNodes: parsed.nodes };
}

// ---- values ---------------------------------------------------------------

const DEFAULT_SAMPLE: Record<VariableType, () => unknown> = {
  text: () => "Sample text",
  number: () => 3,
  money: () => 1500,
  account: () => "1000123456789",
  phone: () => "0911223344",
  datetime: () => new Date().toISOString(),
};

export const sampleFor = (v: Variable & { sample?: unknown }): unknown =>
  v.sample ?? DEFAULT_SAMPLE[v.type]();

/** Ethiopian time (UTC+3), "YYYY-MM-DD HH:mm:ss". */
function eat(value: unknown): { date: string; time: string } | null {
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return null;
  const iso = new Date(d.getTime() + 3 * 3600_000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 19) };
}

export function formatValue(type: VariableType, value: unknown, part?: "date" | "time"): string {
  if (value === null || value === undefined) return "";
  switch (type) {
    case "money": {
      const n = Number(value);
      return Number.isFinite(n)
        ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : String(value);
    }
    case "account": {
      const s = String(value);
      return s.length > 7 ? s.slice(0, 4) + "*".repeat(s.length - 7) + s.slice(-3) : s;
    }
    case "phone": {
      const digits = String(value).replace(/\D/g, "");
      return digits.length >= 9 ? `+251${digits.slice(-9)}` : String(value);
    }
    case "datetime": {
      const t = eat(value);
      if (!t) return String(value);
      return part === "date" ? t.date : part === "time" ? t.time : `${t.date} ${t.time}`;
    }
    default:
      return String(value);
  }
}

const present = (v: unknown) => v !== null && v !== undefined && v !== "";

export function render(
  nodes: Node[],
  variables: Variable[],
  values: Record<string, unknown>,
  snippets: Map<string, string>,
): string {
  const types = new Map(variables.map((v) => [v.name, v.type]));
  const out = (list: Node[]): string =>
    list
      .map((n) => {
        switch (n.kind) {
          case "text":
            return n.text;
          case "var":
            return formatValue(types.get(n.name) ?? "text", values[n.name], n.part);
          case "if":
            return out(present(values[n.name]) ? n.then : n.otherwise);
          case "snippet":
            return out(parse(snippets.get(n.key) ?? "", "").nodes);
        }
      })
      .join("");
  return out(nodes);
}

// ---- SMS length -----------------------------------------------------------

const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€\f";

export function smsLength(text: string): SmsLength {
  const chars = [...text];
  const gsm = chars.every((c) => GSM_BASIC.includes(c) || GSM_EXTENDED.includes(c));
  if (gsm) {
    const characters = chars.reduce((n, c) => n + (GSM_EXTENDED.includes(c) ? 2 : 1), 0);
    return {
      characters,
      encoding: "GSM",
      segments: characters <= 160 ? 1 : Math.ceil(characters / 153),
    };
  }
  const characters = text.length; // UTF-16 code units
  return {
    characters,
    encoding: "UCS2",
    segments: characters <= 70 ? 1 : Math.ceil(characters / 67),
  };
}

export const MAX_SMS_SEGMENTS = 4;

export function smsWarning(sms: SmsLength): Issue | null {
  return sms.segments > MAX_SMS_SEGMENTS
    ? {
        code: "SMS_TOO_LONG",
        message: `The SMS is ${sms.segments} segments long with sample values (more than ${MAX_SMS_SEGMENTS}).`,
        location: "body",
      }
    : null;
}

/** Full check plus render with the given values (missing → sample, null → no value). */
export function evaluate(
  input: CheckInput & { variables: Array<Variable & { sample?: unknown }> },
  given: Record<string, unknown> = {},
) {
  const result = check(input);
  const names = new Set(input.variables.map((v) => v.name));
  const values: Record<string, unknown> = {};
  for (const v of input.variables)
    values[v.name] = Object.hasOwn(given, v.name) ? given[v.name] : sampleFor(v);
  const ignoredValues = Object.keys(given).filter((k) => !names.has(k));
  const unusedVariables = input.variables.map((v) => v.name).filter((n) => !result.used.has(n));

  const info: CheckInfo = { unusedVariables };
  const warnings: Issue[] = [];
  let rendered: { body: string; subject?: string } | null = null;
  if (result.errors.length === 0) {
    rendered = { body: render(result.bodyNodes, input.variables, values, input.snippets) };
    if (result.subjectNodes)
      rendered.subject = render(result.subjectNodes, input.variables, values, input.snippets);
    if (input.channel === "sms") {
      info.sms = smsLength(rendered.body);
      const w = smsWarning(info.sms);
      if (w) warnings.push(w);
    }
  }
  return { errors: result.errors, warnings, info, ignoredValues, values, rendered };
}
