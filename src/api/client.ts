import type {
  ApiError,
  ApiResponse,
  EventPage,
  NamespaceSummary,
  PreviewInput,
  PreviewResult,
  SaveSnippetResult,
  SaveTemplateResult,
  ServiceDetail,
  ServiceSummary,
  SlotKey,
  Snippet,
  SnippetInput,
  SnippetWithUsage,
  Template,
  TemplateInput,
} from "./types";

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/v1.0/notification";

/** Mock API with an in-memory database (default). Set VITE_USE_MOCK=false to call the real service. */
const USE_MOCK = import.meta.env.VITE_USE_MOCK !== "false";

const send = async (path: string, init: RequestInit): Promise<Response> => {
  if (!USE_MOCK) return fetch(`${BASE}${path}`, init);
  const { mockFetch } = await import("../mock/server");
  return mockFetch(path, init);
};

/** Thrown for every failed call; `error` is the API's `{ code, message, errors? }`. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly error: ApiError,
  ) {
    super(error.message);
    this.name = "ApiRequestError";
  }
}

export const isAbort = (e: unknown): boolean =>
  e instanceof DOMException && e.name === "AbortError";

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let res: Response;
  try {
    res = await send(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (isAbort(e)) throw e;
    throw new ApiRequestError(0, {
      code: "NETWORK_ERROR",
      message: "Can't reach the notification service. Check that it is running.",
    });
  }

  let json: ApiResponse<T>;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiRequestError(res.status, {
      code: "INTERNAL_ERROR",
      message: `Unexpected response from the notification service (HTTP ${res.status}).`,
    });
  }
  if (json.error) throw new ApiRequestError(res.status, json.error);
  return json.data as T;
}

const seg = encodeURIComponent;

export const slotPath = (s: SlotKey): string =>
  `/services/${seg(s.service)}/events/${seg(s.event)}/templates/${seg(s.audience)}/${seg(s.channel)}`;

export const api = {
  namespaces: () => request<NamespaceSummary[]>("GET", "/namespaces"),
  services: (namespace: string) =>
    request<ServiceSummary[]>("GET", `/namespaces/${seg(namespace)}/services`),
  service: (code: string) => request<ServiceDetail>("GET", `/services/${seg(code)}`),
  eventPage: (service: string, event: string) =>
    request<EventPage>("GET", `/services/${seg(service)}/events/${seg(event)}`),

  /** Resolves to null when the slot is empty (404 TEMPLATE_NOT_FOUND). */
  getTemplate: async (slot: SlotKey): Promise<Template | null> => {
    try {
      return await request<Template>("GET", slotPath(slot));
    } catch (e) {
      if (e instanceof ApiRequestError && e.error.code === "TEMPLATE_NOT_FOUND") return null;
      throw e;
    }
  },
  saveTemplate: (slot: SlotKey, input: TemplateInput) =>
    request<SaveTemplateResult>("PUT", slotPath(slot), input),
  setActive: (slot: SlotKey, active: boolean) =>
    request<Template>("PATCH", slotPath(slot), { active }),
  preview: (slot: SlotKey, input: PreviewInput, signal?: AbortSignal) =>
    request<PreviewResult>("POST", `${slotPath(slot)}/preview`, input, signal),

  snippets: () => request<SnippetWithUsage[]>("GET", "/snippets"),
  saveSnippet: (key: string, input: SnippetInput) =>
    request<SaveSnippetResult>("PUT", `/snippets/${seg(key)}`, input),
  deleteSnippet: (key: string) => request<Snippet>("DELETE", `/snippets/${seg(key)}`),
};
