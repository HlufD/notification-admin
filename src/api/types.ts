/** Shapes of the Notification Template Service admin API (endpoints 1–7, 9–12). */

export type Channel = "sms" | "email" | "inApp";
export type VariableType = "text" | "number" | "money" | "account" | "phone" | "datetime";
export type SlotStatus = "created" | "off" | "empty";

export interface ApiResponse<T> {
  statusCode: number;
  error: ApiError | null;
  data: T | null;
}

export type ErrorCode =
  | "VALIDATION_FAILED"
  | "INVALID_TEMPLATE"
  | "INVALID_SNIPPET"
  | "SNIPPET_BREAKS_TEMPLATES"
  | "SERVICE_INACTIVE"
  | "EVENT_INACTIVE"
  | "AUDIENCE_NOT_DECLARED"
  | "CHANNEL_NOT_ALLOWED"
  | "NAMESPACE_NOT_FOUND"
  | "SERVICE_NOT_FOUND"
  | "EVENT_NOT_FOUND"
  | "TEMPLATE_NOT_FOUND"
  | "SNIPPET_NOT_FOUND"
  | "SNIPPET_IN_USE"
  | "ROUTE_NOT_FOUND"
  | "INTERNAL_ERROR"
  // Client-side only: the service could not be reached.
  | "NETWORK_ERROR";

export interface ApiError {
  code: ErrorCode;
  message: string;
  errors?: unknown[];
}

export interface FieldError {
  field: string;
  message: string;
}

export type IssueCode =
  | "EMPTY_BODY"
  | "MISSING_SUBJECT"
  | "UNCLOSED_TAG"
  | "STRAY_CLOSE"
  | "INVALID_TAG"
  | "UNCLOSED_IF"
  | "STRAY_END_IF"
  | "STRAY_ELSE"
  | "DUPLICATE_ELSE"
  | "UNKNOWN_VARIABLE"
  | "DATE_PART_NOT_DATETIME"
  | "UNKNOWN_SNIPPET"
  | "NESTED_SNIPPET"
  | "BROKEN_SNIPPET"
  | "SMS_TOO_LONG";

export interface Issue {
  code: IssueCode;
  message: string;
  /** "subject" | "body" | `snippet ${key}` */
  location?: string;
}

export interface TemplateIssues {
  /** "SERVICE / EVENT / audience / channel" */
  template: string;
  issues: Issue[];
}

export interface SmsLength {
  characters: number;
  segments: number;
  encoding: "GSM" | "UCS2";
}

// 1–4: browse
export interface NamespaceSummary {
  namespace: string;
  serviceCount: number;
}

export interface ServiceSummary {
  code: string;
  name: string;
  description?: string;
  active: boolean;
  eventCount: number;
}

export interface EventSummary {
  code: string;
  name: string;
  description?: string;
  active: boolean;
}

export interface ServiceDetail {
  namespace: string;
  code: string;
  name: string;
  description?: string;
  active: boolean;
  events: EventSummary[];
}

export interface Variable {
  name: string;
  type: VariableType;
  required: boolean;
  description?: string;
}

export interface Audience {
  code: string;
  name: string;
  channels: Channel[];
}

export interface Slot {
  audience: string;
  channel: Channel;
  status: SlotStatus;
  updatedAt?: string;
}

export interface EventPage {
  service: { namespace: string; code: string; name: string };
  event: EventSummary;
  variables: Variable[];
  audiences: Audience[];
  slots: Slot[];
}

// 5–7, 9: templates
export interface SlotKey {
  service: string;
  event: string;
  audience: string;
  channel: Channel;
}

export interface Template extends SlotKey {
  subject?: string;
  body: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateInput {
  subject?: string | null;
  body: string;
  /** Always sent: leaving it out would switch an "off" template back on. */
  active: boolean;
}

export interface CheckInfo {
  unusedVariables: string[];
  sms?: SmsLength;
}

export interface SaveTemplateResult {
  template: Template;
  created: boolean;
  warnings: Issue[];
  info: CheckInfo;
}

export interface PreviewInput {
  subject?: string | null;
  body: string;
  values?: Record<string, unknown>;
}

export interface PreviewResult {
  rendered: { body: string; subject?: string } | null;
  errors: Issue[];
  warnings: Issue[];
  info: CheckInfo & { ignoredValues: string[] };
  values: Record<string, unknown>;
}

// 10–12: snippets
export interface Snippet {
  key: string;
  description?: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface SnippetWithUsage extends Snippet {
  usedBy: SlotKey[];
}

export interface SnippetInput {
  description?: string | null;
  body: string;
}

export interface SaveSnippetResult {
  snippet: Snippet;
  created: boolean;
  usedBy: SlotKey[];
  warnings: TemplateIssues[];
}
