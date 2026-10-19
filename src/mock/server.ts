/**
 * Mock of the Notification Template Service admin API, backed by the in-memory `db`.
 * Same paths, envelope (`{ statusCode, error, data }`) and error codes as the real service.
 */
import type {
  ApiError,
  Channel,
  EventPage,
  FieldError,
  NamespaceSummary,
  PreviewInput,
  PreviewResult,
  SaveSnippetResult,
  SaveTemplateResult,
  ServiceDetail,
  ServiceSummary,
  Slot,
  SlotKey,
  SnippetWithUsage,
  Template,
  TemplateIssues,
} from "../api/types";
import { LIMITS } from "../lib/format";
import { db, slotId, type DbEvent, type DbService } from "./db";
import { checkSnippet, evaluate } from "./engine";

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly error: ApiError,
  ) {
    super(error.message);
  }
}

const fail = (status: number, code: ApiError["code"], message: string, errors?: unknown[]) =>
  new HttpError(status, { code, message, ...(errors ? { errors } : {}) });

const clone = <T>(x: T): T => structuredClone(x);
const now = () => new Date().toISOString();

// ---- lookups ---------------------------------------------------------------

function findService(code: string): DbService {
  const s = db.services.find((x) => x.code === code);
  if (!s) throw fail(404, "SERVICE_NOT_FOUND", `Service ${code} not found`);
  return s;
}

function findEvent(service: DbService, code: string): DbEvent {
  const e = service.events.find((x) => x.code === code);
  if (!e) throw fail(404, "EVENT_NOT_FOUND", `Event ${code} not found in ${service.code}`);
  return e;
}

/** Resolves and validates a slot; `forWrite` also requires the service and event to be active. */
function resolveSlot(p: Record<string, string>, forWrite = false) {
  const service = findService(p.service);
  const event = findEvent(service, p.event);
  const audience = event.audiences.find((a) => a.code === p.audience);
  if (!audience)
    throw fail(
      400,
      "AUDIENCE_NOT_DECLARED",
      `Audience ${p.audience} is not declared for ${event.code}`,
    );
  if (!audience.channels.includes(p.channel as Channel))
    throw fail(
      400,
      "CHANNEL_NOT_ALLOWED",
      `Channel ${p.channel} is not allowed for ${audience.code}`,
    );
  if (forWrite && !service.active)
    throw fail(409, "SERVICE_INACTIVE", `Service ${service.code} is inactive`);
  if (forWrite && !event.active)
    throw fail(409, "EVENT_INACTIVE", `Event ${event.code} is inactive`);
  const key: SlotKey = {
    service: service.code,
    event: event.code,
    audience: audience.code,
    channel: p.channel as Channel,
  };
  return { service, event, key, id: slotId(key.service, key.event, key.audience, key.channel) };
}

function findEventByCodes(service: string, event: string): DbEvent | undefined {
  return db.services.find((s) => s.code === service)?.events.find((e) => e.code === event);
}

const snippetBodies = (override?: [string, string]) => {
  const map = new Map([...db.snippets.values()].map((s) => [s.key, s.body]));
  if (override) map.set(override[0], override[1]);
  return map;
};

const usesSnippet = (t: Template, key: string) => {
  const re = new RegExp(`\\{\\{\\s*>\\s*${key}\\s*\\}\\}`);
  return re.test(t.body) || re.test(t.subject ?? "");
};

const usedBy = (key: string): SlotKey[] =>
  [...db.templates.values()]
    .filter((t) => usesSnippet(t, key))
    .map(({ service, event, audience, channel }) => ({ service, event, audience, channel }));

// ---- validation ------------------------------------------------------------

function requireFields(fields: FieldError[]) {
  if (fields.length) throw fail(400, "VALIDATION_FAILED", "The request is not valid", fields);
}

function validateText(
  fields: FieldError[],
  field: string,
  value: unknown,
  max: number,
  required: boolean,
) {
  if (value === undefined || value === null) {
    if (required) fields.push({ field, message: "is required" });
  } else if (typeof value !== "string") fields.push({ field, message: "must be a string" });
  else if (value.length > max) fields.push({ field, message: `must be at most ${max} characters` });
}

// ---- handlers ---------------------------------------------------------------

type Handler = (params: Record<string, string>, body: any) => unknown;

function namespaces(): NamespaceSummary[] {
  const counts = new Map<string, number>();
  for (const s of db.services) counts.set(s.namespace, (counts.get(s.namespace) ?? 0) + 1);
  return [...counts].map(([namespace, serviceCount]) => ({ namespace, serviceCount }));
}

function services({ namespace }: Record<string, string>): ServiceSummary[] {
  const list = db.services.filter((s) => s.namespace === namespace);
  if (!list.length) throw fail(404, "NAMESPACE_NOT_FOUND", `Namespace ${namespace} not found`);
  return list.map(({ code, name, description, active, events }) => ({
    code,
    name,
    description,
    active,
    eventCount: events.length,
  }));
}

function service({ service }: Record<string, string>): ServiceDetail {
  const s = findService(service);
  return {
    namespace: s.namespace,
    code: s.code,
    name: s.name,
    description: s.description,
    active: s.active,
    events: s.events.map(({ code, name, description, active }) => ({
      code,
      name,
      description,
      active,
    })),
  };
}

function eventPage(p: Record<string, string>): EventPage {
  const s = findService(p.service);
  const e = findEvent(s, p.event);
  const slots: Slot[] = e.audiences.flatMap((a) =>
    a.channels.map((channel): Slot => {
      const t = db.templates.get(slotId(s.code, e.code, a.code, channel));
      return t
        ? {
            audience: a.code,
            channel,
            status: t.active ? "created" : "off",
            updatedAt: t.updatedAt,
          }
        : { audience: a.code, channel, status: "empty" };
    }),
  );
  return {
    service: { namespace: s.namespace, code: s.code, name: s.name },
    event: { code: e.code, name: e.name, description: e.description, active: e.active },
    variables: e.variables.map(({ sample: _sample, ...v }) => v),
    audiences: e.audiences,
    slots,
  };
}

function getTemplate(p: Record<string, string>): Template {
  const { id } = resolveSlot(p);
  const t = db.templates.get(id);
  if (!t) throw fail(404, "TEMPLATE_NOT_FOUND", `No template for ${id}`);
  return t;
}

function saveTemplate(p: Record<string, string>, body: any): SaveTemplateResult {
  const { event, key, id } = resolveSlot(p, true);
  const fields: FieldError[] = [];
  validateText(fields, "body", body?.body, LIMITS.templateBody, true);
  validateText(fields, "subject", body?.subject, LIMITS.subject, false);
  if (body?.active !== undefined && typeof body.active !== "boolean")
    fields.push({ field: "active", message: "must be a boolean" });
  requireFields(fields);

  const subject = key.channel === "sms" ? null : (body.subject as string | null | undefined);
  const result = evaluate({
    channel: key.channel,
    subject,
    body: body.body,
    variables: event.variables,
    snippets: snippetBodies(),
  });
  if (result.errors.length)
    throw fail(422, "INVALID_TEMPLATE", "The template has errors", result.errors);

  const existing = db.templates.get(id);
  const time = now();
  const template: Template = {
    ...key,
    ...(subject ? { subject } : {}),
    body: body.body,
    active: body.active ?? true,
    createdAt: existing?.createdAt ?? time,
    updatedAt: time,
  };
  db.templates.set(id, template);
  return { template, created: !existing, warnings: result.warnings, info: result.info };
}

function setActive(p: Record<string, string>, body: any): Template {
  const { id } = resolveSlot(p, true);
  if (typeof body?.active !== "boolean")
    throw fail(400, "VALIDATION_FAILED", "The request is not valid", [
      { field: "active", message: "must be a boolean" },
    ]);
  const t = db.templates.get(id);
  if (!t) throw fail(404, "TEMPLATE_NOT_FOUND", `No template for ${id}`);
  t.active = body.active;
  t.updatedAt = now();
  return t;
}

function preview(p: Record<string, string>, body: PreviewInput): PreviewResult {
  const { event, key } = resolveSlot(p);
  const fields: FieldError[] = [];
  validateText(fields, "body", body?.body, LIMITS.templateBody, true);
  validateText(fields, "subject", body?.subject, LIMITS.subject, false);
  requireFields(fields);
  const r = evaluate(
    {
      channel: key.channel,
      subject: body.subject,
      body: body.body,
      variables: event.variables,
      snippets: snippetBodies(),
    },
    body.values ?? {},
  );
  return {
    rendered: r.rendered,
    errors: r.errors,
    warnings: r.warnings,
    info: { ...r.info, ignoredValues: r.ignoredValues },
    values: r.values,
  };
}

function snippets(): SnippetWithUsage[] {
  return [...db.snippets.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((s) => ({ ...s, usedBy: usedBy(s.key) }));
}

function saveSnippet({ key }: Record<string, string>, body: any): SaveSnippetResult {
  const fields: FieldError[] = [];
  if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(key))
    fields.push({
      field: "key",
      message: "must start with a letter and contain only letters and digits",
    });
  else if (key.length > LIMITS.snippetKey)
    fields.push({ field: "key", message: `must be at most ${LIMITS.snippetKey} characters` });
  validateText(fields, "body", body?.body, LIMITS.snippetBody, true);
  validateText(fields, "description", body?.description, LIMITS.description, false);
  requireFields(fields);

  const issues = checkSnippet(body.body);
  if (issues.length) throw fail(422, "INVALID_SNIPPET", "The snippet has errors", issues);

  // Re-check every template that uses this snippet with the new text.
  const bodies = snippetBodies([key, body.body]);
  const broken: TemplateIssues[] = [];
  const warnings: TemplateIssues[] = [];
  const users = usedBy(key);
  for (const slot of users) {
    const t = db.templates.get(slotId(slot.service, slot.event, slot.audience, slot.channel))!;
    const event = findEventByCodes(t.service, t.event);
    if (!event) continue;
    const r = evaluate({
      channel: t.channel,
      subject: t.subject,
      body: t.body,
      variables: event.variables,
      snippets: bodies,
    });
    const label = slotId(t.service, t.event, t.audience, t.channel);
    if (r.errors.length) broken.push({ template: label, issues: r.errors });
    else if (r.warnings.length) warnings.push({ template: label, issues: r.warnings });
  }
  if (broken.length)
    throw fail(
      422,
      "SNIPPET_BREAKS_TEMPLATES",
      `This change would break ${broken.length} template${broken.length === 1 ? "" : "s"}`,
      broken,
    );

  const existing = db.snippets.get(key);
  const time = now();
  const description = (body.description as string | null | undefined) || undefined;
  const snippet = {
    key,
    ...(description ? { description } : {}),
    body: body.body as string,
    createdAt: existing?.createdAt ?? time,
    updatedAt: time,
  };
  db.snippets.set(key, snippet);
  return { snippet, created: !existing, usedBy: users, warnings };
}

function deleteSnippet({ key }: Record<string, string>) {
  const s = db.snippets.get(key);
  if (!s) throw fail(404, "SNIPPET_NOT_FOUND", `Snippet ${key} not found`);
  const users = usedBy(key);
  if (users.length)
    throw fail(
      409,
      "SNIPPET_IN_USE",
      `Snippet ${key} is used by ${users.length} template${users.length === 1 ? "" : "s"}`,
      users.map((u) => slotId(u.service, u.event, u.audience, u.channel)),
    );
  db.snippets.delete(key);
  return s;
}

// ---- routing ---------------------------------------------------------------

const SLOT = "/services/:service/events/:event/templates/:audience/:channel";

const routes: Array<[string, string, Handler]> = [
  ["GET", "/namespaces", namespaces],
  ["GET", "/namespaces/:namespace/services", services],
  ["GET", "/services/:service", service],
  ["GET", "/services/:service/events/:event", eventPage],
  ["GET", SLOT, getTemplate],
  ["PUT", SLOT, saveTemplate],
  ["PATCH", SLOT, setActive],
  ["POST", `${SLOT}/preview`, preview],
  ["GET", "/snippets", snippets],
  ["PUT", "/snippets/:key", saveSnippet],
  ["DELETE", "/snippets/:key", deleteSnippet],
];

function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split("/");
  const b = path.split("/");
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(":")) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

function handle(method: string, path: string, body: unknown): { status: number; json: unknown } {
  try {
    for (const [m, pattern, handler] of routes) {
      if (m !== method) continue;
      const params = match(pattern, path);
      if (params) {
        const data = clone(handler(params, body));
        return { status: 200, json: { statusCode: 200, error: null, data } };
      }
    }
    throw fail(404, "ROUTE_NOT_FOUND", `Route ${method} ${path} not found`);
  } catch (e) {
    const err =
      e instanceof HttpError
        ? e
        : fail(500, "INTERNAL_ERROR", e instanceof Error ? e.message : "Internal error");
    return { status: err.status, json: { statusCode: err.status, error: err.error, data: null } };
  }
}

const abortError = () => new DOMException("The operation was aborted.", "AbortError");

/** A `fetch` look-alike: same Response shape, small random latency, honours AbortSignal. */
export function mockFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { signal } = init;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const timer = setTimeout(
      () => {
        signal?.removeEventListener("abort", onAbort);
        const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
        const { status, json } = handle((init.method ?? "GET").toUpperCase(), path, body);
        resolve(
          new Response(JSON.stringify(json), {
            status,
            headers: { "Content-Type": "application/json" },
          }),
        );
      },
      120 + Math.random() * 180,
    );
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
