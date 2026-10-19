import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiRequestError, api, isAbort } from "../api/client";
import type {
  Channel,
  EventPage,
  FieldError,
  Issue,
  PreviewResult,
  SlotKey,
  SnippetWithUsage,
  Template,
  Variable,
} from "../api/types";
import { useCrumbs, useToast } from "../components/Layout";
import { buildSuggestions, useTagAutocomplete } from "../components/TagAutocomplete";
import { Button, Card, Chip, ErrorState, Icon, Loading, Notice, cx } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import {
  CHANNELS,
  CHANNEL_META,
  LIMITS,
  TYPE_HINT,
  TYPE_LABEL,
  fromLocalInput,
  plural,
  relativeTime,
  toLocalInput,
} from "../lib/format";

export default function TemplateEditorPage() {
  const { service = "", event = "", audience = "", channel = "" } = useParams();

  const { data, error, loading, reload } = useAsync(async () => {
    const [page, serviceDetail, snippets] = await Promise.all([
      api.eventPage(service, event),
      api.service(service),
      api.snippets(),
    ]);
    const allowed = page.audiences
      .find((a) => a.code === audience)
      ?.channels.includes(channel as Channel);
    const template = allowed
      ? await api.getTemplate({
          service: page.service.code,
          event: page.event.code,
          audience,
          channel: channel as Channel,
        })
      : null;
    return { page, serviceActive: serviceDetail.active, snippets, template };
  }, [service, event, audience, channel]);

  useCrumbs(
    data
      ? [
          {
            label: data.page.service.namespace,
            to: `/namespaces/${data.page.service.namespace}`,
            kind: "namespace",
          },
          {
            label: data.page.service.code,
            to: `/services/${data.page.service.code}`,
            kind: "service",
          },
          {
            label: data.page.event.code,
            to: `/services/${data.page.service.code}/events/${data.page.event.code}`,
            kind: "event",
          },
          {
            label: `${audience} · ${CHANNEL_META[channel as Channel]?.label ?? channel}`,
            kind: "plain",
          },
        ]
      : [],
  );

  const back = { to: `/services/${service}/events/${event}`, label: "Back to the event" };
  if (error) return <ErrorState error={error} onRetry={reload} back={back} />;
  if (loading && !data) return <Loading />;
  if (!data) return null;

  const aud = data.page.audiences.find((a) => a.code === audience);
  if (
    !CHANNELS.includes(channel as Channel) ||
    !aud ||
    !aud.channels.includes(channel as Channel)
  ) {
    return (
      <ErrorState
        error={
          new ApiRequestError(404, {
            code: "ROUTE_NOT_FOUND",
            message: !aud
              ? `"${audience}" isn't an audience of this event.`
              : `${channel} isn't allowed for ${aud.name}.`,
          })
        }
        back={back}
      />
    );
  }

  return (
    <Editor
      key={`${service}/${event}/${audience}/${channel}`}
      page={data.page}
      serviceActive={data.serviceActive}
      snippets={data.snippets}
      initialTemplate={data.template}
      audienceCode={aud.code}
      audienceName={aud.name}
      channel={channel as Channel}
    />
  );
}

interface SaveProblem {
  message: string;
  issues?: Issue[];
  fields?: FieldError[];
}

function Editor({
  page,
  serviceActive,
  snippets,
  initialTemplate,
  audienceCode,
  audienceName,
  channel,
}: {
  page: EventPage;
  serviceActive: boolean;
  snippets: SnippetWithUsage[];
  initialTemplate: Template | null;
  audienceCode: string;
  audienceName: string;
  channel: Channel;
}) {
  const toast = useToast();
  const slot: SlotKey = {
    service: page.service.code,
    event: page.event.code,
    audience: audienceCode,
    channel,
  };
  const meta = CHANNEL_META[channel];
  const usesSubject = channel !== "sms";
  const editable = serviceActive && page.event.active;
  const eventPath = `/services/${slot.service}/events/${slot.event}`;

  const [template, setTemplate] = useState(initialTemplate);
  const [subject, setSubject] = useState(initialTemplate?.subject ?? "");
  const [body, setBody] = useState(initialTemplate?.body ?? "");
  const [active, setActive] = useState(initialTemplate?.active ?? true);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [checking, setChecking] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [problem, setProblem] = useState<SaveProblem | null>(null);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const lastField = useRef<"body" | "subject">("body");

  const suggestions = useMemo(
    () =>
      buildSuggestions(
        page.variables,
        snippets.map((s) => s.key),
      ),
    [page.variables, snippets],
  );
  const bodyComplete = useTagAutocomplete({ ref: bodyRef, onChange: setBody, suggestions });
  const subjectComplete = useTagAutocomplete({
    ref: subjectRef,
    onChange: setSubject,
    suggestions,
  });

  const savedSubject = template?.subject ?? "";
  const savedBody = template?.body ?? "";
  const dirty = template
    ? subject !== savedSubject || body !== savedBody
    : body !== "" || subject !== "";

  // Live preview: debounced, the previous request is cancelled when the text changes.
  useEffect(() => {
    const controller = new AbortController();
    setChecking(true);
    const timer = setTimeout(() => {
      api
        .preview(
          slot,
          { subject: usesSubject ? subject : undefined, body, values },
          controller.signal,
        )
        .then((result) => {
          setPreview(result);
          setPreviewError(null);
          setChecking(false);
        })
        .catch((e: unknown) => {
          if (isAbort(e)) return;
          setPreviewError(e instanceof ApiRequestError ? e.error.message : "Preview failed.");
          setChecking(false);
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [subject, body, values]);

  // Warn before leaving with unsaved text.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const insert = (text: string) => {
    const field = usesSubject && lastField.current === "subject" ? "subject" : "body";
    const el = field === "subject" ? subjectRef.current : bodyRef.current;
    const current = field === "subject" ? subject : body;
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + text + current.slice(end);
    if (field === "subject") setSubject(next);
    else setBody(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + text.length, start + text.length);
    });
  };

  const save = async () => {
    setSaving(true);
    setProblem(null);
    try {
      const result = await api.saveTemplate(slot, {
        subject: usesSubject ? subject : null,
        body,
        active,
      });
      setTemplate(result.template);
      setSubject(result.template.subject ?? "");
      setBody(result.template.body);
      toast(
        result.created
          ? `Template created${result.template.active ? ". The next notification uses this text." : " (switched off, not sent yet)."}`
          : result.template.active
            ? "Template saved. The next notification uses this text."
            : "Template saved. It is switched off, so it is not sent.",
      );
      result.warnings.forEach((w) => toast(w.message, "info"));
    } catch (e) {
      if (!(e instanceof ApiRequestError)) throw e;
      const { code, message, errors } = e.error;
      setProblem({
        message,
        issues: code === "INVALID_TEMPLATE" ? (errors as Issue[]) : undefined,
        fields: code === "VALIDATION_FAILED" ? (errors as FieldError[]) : undefined,
      });
      toast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async () => {
    if (!template) {
      setActive((a) => !a); // a new template: decides how it is created
      return;
    }
    setToggling(true);
    try {
      const updated = await api.setActive(slot, !template.active);
      setTemplate(updated);
      setActive(updated.active);
      toast(
        updated.active
          ? "Template switched on. It is sent again."
          : "Template switched off. It is no longer sent.",
      );
    } catch (e) {
      toast(
        e instanceof ApiRequestError ? e.error.message : "Could not change the status.",
        "error",
      );
    } finally {
      setToggling(false);
    }
  };

  const discard = () => {
    setSubject(savedSubject);
    setBody(savedBody);
    setProblem(null);
  };

  const errors = preview?.errors ?? [];
  const canSave = editable && dirty && !saving && !checking && errors.length === 0 && !previewError;
  const isOn = template ? template.active : active;

  const statusChip = !template ? (
    <Chip tone="info" icon="edit_note">
      New
    </Chip>
  ) : template.active ? (
    <Chip tone="success" dot>
      On · sent
    </Chip>
  ) : (
    <Chip tone="off" dot>
      Off · not sent
    </Chip>
  );

  return (
    <div className="flex w-full flex-col">
      {/* Context bar */}
      <div className="flex flex-col justify-between gap-space-md bg-surface-container-lowest px-space-md py-space-md shadow-sm md:flex-row md:items-center">
        <div className="flex min-w-0 items-start gap-space-md">
          <Link
            to={eventPath}
            title="Back to the event"
            className="focus-ring mt-1 flex items-center justify-center rounded bg-surface-container-low p-2 text-primary hover:bg-surface-container"
          >
            <Icon name="arrow_back" />
          </Link>
          <div className="flex flex-col">
            <div className="flex flex-wrap items-center gap-space-sm">
              <h1 className="text-[19px] font-semibold tracking-tight">
                Template editor: {audienceName} · {meta.label}
              </h1>
              {statusChip}
              {dirty && <Chip tone="warning">Unsaved changes</Chip>}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-body-sm text-on-surface-variant">
              <span>
                <span className="font-medium text-primary">Audience:</span> {audienceName} (
                {audienceCode})
              </span>
              <span className="text-outline-variant">|</span>
              <span>
                <span className="font-medium text-primary">Channel:</span> {meta.label}
              </span>
              {template && (
                <>
                  <span className="text-outline-variant">|</span>
                  <span>Last saved {relativeTime(template.updatedAt)}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-space-sm self-end md:self-center">
          <StatusToggle isOn={isOn} isNew={!template} busy={toggling} onToggle={toggleActive} />
          <Button onClick={discard} disabled={!dirty || saving}>
            Discard
          </Button>
          <Button variant="primary" icon="save" busy={saving} disabled={!canSave} onClick={save}>
            {template ? "Save template" : "Create template"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-space-md p-space-md xl:grid-cols-12">
        {/* LEFT: palette, editor, checks */}
        <div className="flex flex-col gap-space-md xl:col-span-7">
          {!editable && (
            <Notice
              icon="do_not_disturb_on"
              tone="warning"
              title={`The ${serviceActive ? "event" : "service"} is switched off`}
            >
              You can edit and preview, but saving is refused until developers switch it back on.
            </Notice>
          )}

          <Palette variables={page.variables} snippets={snippets} onInsert={insert} />

          {usesSubject && (
            <Card className="flex flex-col gap-1.5 p-space-md">
              <label
                htmlFor="subject"
                className="flex items-center justify-between text-caption uppercase text-on-surface-variant"
              >
                <span>
                  {meta.subject} <span className="text-error">*</span>
                </span>
                <span className="font-mono normal-case">
                  {subject.length} / {LIMITS.subject}
                </span>
              </label>
              <input
                id="subject"
                ref={subjectRef}
                value={subject}
                maxLength={LIMITS.subject}
                onFocus={() => (lastField.current = "subject")}
                onChange={(e) => {
                  setSubject(e.target.value);
                  subjectComplete.refresh();
                }}
                {...subjectComplete.handlers}
                placeholder={
                  channel === "email"
                    ? "e.g. Debit alert: ETB {{amount}} transferred"
                    : "e.g. Transfer successful"
                }
                className="w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 font-mono text-code-lg focus:outline-none focus:ring-2 focus:ring-secondary"
              />
              {subjectComplete.menu}
            </Card>
          )}

          <Card className="flex flex-col overflow-hidden">
            <div className="flex items-center justify-between bg-surface-container-low px-space-md py-2">
              <span className="flex items-center gap-1.5 font-mono text-[12px] font-bold text-primary">
                <Icon name="code" className="text-[16px] text-secondary" />
                Message body ({meta.label}, plain text)
              </span>
              <div className="flex items-center gap-space-sm text-body-sm text-on-surface-variant">
                <span className="font-mono">
                  {body.length} / {LIMITS.templateBody}
                </span>
                <span className="text-outline-variant">|</span>
                <button
                  type="button"
                  className="flex items-center gap-1 hover:text-primary"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(body)
                      .then(() => toast("Template text copied", "info"))
                  }
                >
                  <Icon name="content_copy" className="text-[15px]" /> Copy
                </button>
              </div>
            </div>
            <textarea
              ref={bodyRef}
              value={body}
              maxLength={LIMITS.templateBody}
              onFocus={() => (lastField.current = "body")}
              onChange={(e) => {
                setBody(e.target.value);
                bodyComplete.refresh();
              }}
              {...bodyComplete.handlers}
              spellCheck={false}
              rows={9}
              placeholder="Dear {{debtorName}}, you have successfully transferred ETB {{amount}} …"
              className="min-h-[220px] w-full resize-y bg-surface-container-lowest p-3 font-mono text-[12px] leading-[22px] focus:bg-surface-bright/50 focus:outline-none"
            />
            {bodyComplete.menu}
            <div className="flex items-center gap-1.5 border-t border-outline-variant/20 bg-surface-container-lowest px-3 py-1 text-[11px] text-on-surface-variant">
              <Icon name="keyboard" className="text-[14px]" />
              Type <code className="font-mono text-primary">{"{{"}</code> for variable, condition
              and snippet suggestions.
            </div>
            {channel === "sms" && <SmsMeter preview={preview} checking={checking} />}
          </Card>

          <ChecksPanel
            preview={preview}
            checking={checking}
            previewError={previewError}
            problem={problem}
          />

          <Card className="flex items-center justify-between gap-2 p-space-md">
            <span className="text-body-sm text-on-surface-variant">
              {template
                ? "There is no delete: rewrite the text, or switch the template off to stop sending it."
                : "Nothing is sent from this slot until you create the template."}
            </span>
            <div className="flex shrink-0 items-center gap-space-sm">
              {template && (
                <Button busy={toggling} onClick={toggleActive}>
                  {template.active ? "Switch off" : "Switch on"}
                </Button>
              )}
              <Button
                variant="primary"
                icon="check"
                busy={saving}
                disabled={!canSave}
                onClick={save}
              >
                {template ? "Save template" : "Create template"}
              </Button>
            </div>
          </Card>
        </div>

        {/* RIGHT: live preview and test values */}
        <div className="flex flex-col gap-space-md xl:col-span-5">
          <Card className="flex items-center justify-center gap-1.5 p-2 text-body-md font-semibold text-primary">
            <Icon name={meta.icon} />
            {meta.label} preview
            {checking && (
              <Icon name="progress_activity" className="animate-spin text-[16px] text-outline" />
            )}
          </Card>
          <Card className="flex flex-col items-center p-space-md">
            <PreviewFrame channel={channel} preview={preview} previewError={previewError} />
            <p className="mt-3 text-center text-[11px] text-on-surface-variant">
              Rendered by the notification service with your test values; variables without a value
              use samples.
            </p>
          </Card>
          <TestValues
            variables={page.variables}
            values={values}
            setValues={setValues}
            preview={preview}
          />
        </div>
      </div>
    </div>
  );
}

function StatusToggle({
  isOn,
  isNew,
  busy,
  onToggle,
}: {
  isOn: boolean;
  isNew: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded bg-surface-container-low px-2.5 py-1">
      <span className="text-[12px] font-medium">{isNew ? "Create as" : "Status"}</span>
      <button
        type="button"
        disabled={busy}
        onClick={onToggle}
        className="focus-ring flex items-center gap-1.5 rounded bg-surface-container-lowest px-2 py-0.5 font-mono text-code-sm shadow-sm hover:bg-surface-container disabled:opacity-50"
      >
        <span
          className={cx("h-2 w-2 rounded-full", isOn ? "bg-tertiary-container" : "bg-outline")}
        />
        {isOn ? "On" : "Off"}
        <span className="ml-1 text-[10px] text-on-surface-variant">
          ({isNew ? "change" : isOn ? "switch off" : "switch on"})
        </span>
      </button>
    </div>
  );
}

function Palette({
  variables,
  snippets,
  onInsert,
}: {
  variables: Variable[];
  snippets: SnippetWithUsage[];
  onInsert: (text: string) => void;
}) {
  const optional = variables.filter((v) => !v.required);
  const chip =
    "focus-ring group flex items-center gap-1 rounded px-2 py-1 font-mono text-code-sm transition-colors hover:bg-secondary-fixed";
  return (
    <Card className="flex flex-col gap-space-md p-space-md">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-caption uppercase text-on-surface-variant">
            <Icon name="token" className="text-[15px] text-secondary" /> Click to insert a variable
            at the cursor
          </span>
          <span className="flex items-center gap-1 text-[11px] text-on-surface-variant">
            <span className="h-1.5 w-1.5 rounded-full bg-error" /> Required
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {variables.flatMap((v) => {
            const tags =
              v.type === "datetime" ? [v.name, `${v.name}.date`, `${v.name}.time`] : [v.name];
            return tags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onInsert(`{{${t}}}`)}
                title={`${TYPE_LABEL[v.type]}${v.required ? ", required" : ", optional"}. ${TYPE_HINT[v.type]}${v.description ? `\n${v.description}` : ""}`}
                className={cx(chip, "bg-surface-container-low text-primary")}
              >
                {v.required && <span className="h-1.5 w-1.5 rounded-full bg-error" />}
                {t.endsWith(".date") && (
                  <Icon name="calendar_today" className="text-[13px] text-on-surface-variant" />
                )}
                {t.endsWith(".time") && (
                  <Icon name="schedule" className="text-[13px] text-on-surface-variant" />
                )}
                {`{{${t}}}`}
              </button>
            ));
          })}
        </div>
      </div>

      {optional.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-caption uppercase text-on-surface-variant">
            Optional values: show text only when the value is sent
          </span>
          <div className="flex flex-wrap gap-1.5">
            {optional.map((v) => (
              <button
                key={v.name}
                type="button"
                onClick={() => onInsert(`{{#if ${v.name}}}{{${v.name}}}{{/if}}`)}
                className={cx(chip, "bg-surface-container-high font-semibold text-primary")}
              >
                <span className="rounded-sm bg-primary px-1 text-[9px] text-on-primary">IF</span>
                {`{{#if ${v.name}}}…{{/if}}`}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 rounded bg-surface-bright px-3 py-2 sm:flex-row sm:items-center">
        <span className="whitespace-nowrap text-caption uppercase text-on-surface-variant">
          Reusable snippets:
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {snippets.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => onInsert(`{{> ${s.key}}}`)}
              title={s.body}
              className="focus-ring flex items-center gap-1.5 rounded bg-primary-container px-2.5 py-1 font-mono text-code-sm text-on-primary-container hover:bg-primary hover:text-on-primary"
            >
              <Icon name="extension" className="text-[13px]" />
              {`{{> ${s.key}}}`}
              {s.description && (
                <span className="max-w-[160px] truncate text-[9px] opacity-75">
                  ({s.description})
                </span>
              )}
            </button>
          ))}
          {snippets.length === 0 && (
            <span className="text-body-sm text-on-surface-variant">
              None yet.{" "}
              <Link to="/snippets/new" className="text-secondary hover:underline">
                Create a snippet
              </Link>
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

function SmsMeter({ preview, checking }: { preview: PreviewResult | null; checking: boolean }) {
  const sms = preview?.info.sms;
  if (!sms) {
    return (
      <div className="flex items-center gap-2 bg-surface-container-low px-space-md py-2.5 text-body-sm text-on-surface-variant">
        <Icon name="analytics" className="text-secondary" />
        {checking ? "Measuring…" : "Fix the errors to measure the SMS length."}
      </div>
    );
  }
  const single = sms.encoding === "GSM" ? 160 : 70;
  const per = sms.encoding === "GSM" ? 153 : 67;
  const boundary = sms.segments <= 1 ? single : sms.segments * per;
  const tone =
    sms.segments > LIMITS.smsSegments
      ? "bg-error"
      : sms.segments > 1
        ? "bg-warning"
        : "bg-secondary";
  return (
    <div className="flex flex-col justify-between gap-2 bg-surface-container-low px-space-md py-2.5 sm:flex-row sm:items-center">
      <span className="flex items-center gap-2 font-mono text-[12px]">
        <Icon name="analytics" className="text-secondary" />
        {sms.characters} characters after filling in · {plural(sms.segments, "SMS segment")} (
        {sms.encoding})
      </span>
      <div className="flex items-center gap-2">
        <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-container-high">
          <div
            className={cx("h-full rounded-full transition-all", tone)}
            style={{ width: `${Math.min(100, (sms.characters / boundary) * 100)}%` }}
          />
        </div>
        <span className="font-mono text-code-sm text-on-surface-variant">
          {sms.encoding === "UCS2" ? "Unicode: 70 per SMS" : `Next segment after ${boundary}`}
        </span>
      </div>
    </div>
  );
}

function locationLabel(location?: string): string {
  if (!location) return "";
  if (location === "subject") return "Subject / title";
  if (location === "body") return "Body";
  return location.replace(/^snippet /, "In snippet ");
}

function IssueRow({ issue, tone }: { issue: Issue; tone: "error" | "warning" }) {
  return (
    <div
      className={cx(
        "flex items-start gap-2.5 rounded p-2.5",
        tone === "error" ? "bg-error-container/40" : "bg-warning-container",
      )}
    >
      <Icon
        name={tone === "error" ? "error" : "warning"}
        className={cx("mt-0.5", tone === "error" ? "text-error" : "text-warning")}
      />
      <div className="flex flex-col">
        <span className="text-[12px] font-medium leading-tight">{issue.message}</span>
        <span className="mt-0.5 font-mono text-code-sm text-on-surface-variant">
          {locationLabel(issue.location)} · {issue.code}
        </span>
      </div>
    </div>
  );
}

function ChecksPanel({
  preview,
  checking,
  previewError,
  problem,
}: {
  preview: PreviewResult | null;
  checking: boolean;
  previewError: string | null;
  problem: SaveProblem | null;
}) {
  const errors = preview?.errors ?? [];
  const warnings = preview?.warnings ?? [];
  const status: ReactNode = previewError ? (
    <Chip tone="error">Check failed</Chip>
  ) : checking && !preview ? (
    <Chip>Checking…</Chip>
  ) : errors.length ? (
    <Chip tone="error">{plural(errors.length, "error")} · can't save</Chip>
  ) : warnings.length ? (
    <Chip tone="warning">Ready to save · {plural(warnings.length, "warning")}</Chip>
  ) : (
    <Chip tone="success">Ready to save</Chip>
  );

  return (
    <Card className="flex flex-col gap-space-sm p-space-md">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold">
          <Icon name="fact_check" className="text-primary" /> Validation checks
        </h3>
        {status}
      </div>
      <div className="flex flex-col gap-2">
        {previewError && (
          <IssueRow tone="error" issue={{ code: "INVALID_TAG", message: previewError }} />
        )}
        {problem?.fields?.map((f) => (
          <IssueRow
            key={f.field}
            tone="error"
            issue={{ code: "INVALID_TAG", message: `${f.field}: ${f.message}` }}
          />
        ))}
        {problem && !problem.issues && !problem.fields && (
          <IssueRow tone="error" issue={{ code: "INVALID_TAG", message: problem.message }} />
        )}
        {errors.map((e, i) => (
          <IssueRow key={`e${i}`} tone="error" issue={e} />
        ))}
        {preview && errors.length === 0 && !previewError && (
          <div className="flex items-start gap-2.5 rounded bg-surface-container-low p-2.5">
            <Icon name="check_circle" className="mt-0.5 text-tertiary" />
            <div className="flex flex-col">
              <span className="text-[12px] font-medium">
                All tags are valid and every variable is declared for this event.
              </span>
              <span className="mt-0.5 text-[11px] text-on-surface-variant">
                Typos such as {"{{amont}}"} are caught here before saving.
              </span>
            </div>
          </div>
        )}
        {warnings.map((w, i) => (
          <IssueRow key={`w${i}`} tone="warning" issue={w} />
        ))}
        {preview && preview.info.unusedVariables.length > 0 && (
          <div className="flex items-start gap-2.5 rounded bg-surface-bright p-2.5">
            <Icon name="info" className="mt-0.5 text-outline" />
            <div className="flex flex-col">
              <span className="text-[12px] font-medium">
                Not used in this template (information only)
              </span>
              <span className="mt-0.5 font-mono text-code-sm text-on-surface-variant">
                {preview.info.unusedVariables.join(", ")}
              </span>
            </div>
          </div>
        )}
        {preview && preview.info.ignoredValues.length > 0 && (
          <div className="flex items-start gap-2.5 rounded bg-surface-bright p-2.5">
            <Icon name="info" className="mt-0.5 text-outline" />
            <span className="text-[12px]">
              Test values ignored (not variables of this event):{" "}
              <span className="font-mono">{preview.info.ignoredValues.join(", ")}</span>
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}

function PreviewFrame({
  channel,
  preview,
  previewError,
}: {
  channel: Channel;
  preview: PreviewResult | null;
  previewError: string | null;
}) {
  const rendered = preview?.rendered;
  const placeholder = (
    <p className="p-3 text-center text-body-sm text-on-surface-variant">
      {previewError
        ? "The preview could not be loaded."
        : preview
          ? "Fix the errors on the left to see the message."
          : "Loading preview…"}
    </p>
  );
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (channel === "email") {
    return (
      <div className="w-full overflow-hidden rounded-md border border-outline-variant/60 shadow-sm">
        <div className="flex items-center gap-1.5 bg-surface-container-low px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-error/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-tertiary-fixed-dim" />
          <span className="ml-2 text-[11px] text-on-surface-variant">Inbox</span>
        </div>
        {rendered ? (
          <div className="flex flex-col gap-3 bg-white p-4">
            <div className="border-b border-outline-variant/40 pb-2">
              <span className="text-caption uppercase text-on-surface-variant">Subject</span>
              <p className="text-headline-sm">{rendered.subject}</p>
              <span className="text-[11px] text-on-surface-variant">From Ex Bank · {time}</span>
            </div>
            <p className="whitespace-pre-wrap break-words text-body-md">{rendered.body}</p>
          </div>
        ) : (
          <div className="bg-white">{placeholder}</div>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-[340px] rounded-[36px] bg-slate-900 p-2.5 shadow-2xl">
      <div className="flex min-h-[460px] w-full flex-col overflow-hidden rounded-[28px] bg-[#f1f5f9]">
        <div className="flex items-center justify-between bg-slate-800 px-4 py-1.5 font-mono text-[10px] text-white">
          <span className="flex items-center gap-1">
            <Icon name="signal_cellular_4_bar" className="text-[11px]" />
          </span>
          <span className="text-[11px] font-bold">{time}</span>
          <Icon name="battery_full" className="text-[12px]" />
        </div>
        {channel === "sms" ? (
          <>
            <div className="flex items-center gap-2 bg-white px-3 py-2 shadow-sm">
              <Icon name="arrow_back_ios" className="text-[16px] text-secondary" />
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-on-primary">
                D
              </div>
              <span className="text-[12px] font-semibold">Ex Bank</span>
            </div>
            <div className="my-3 flex justify-center">
              <span className="rounded-full bg-surface-container-high/80 px-2.5 py-0.5 font-mono text-[10px] text-on-surface-variant">
                Today {time}
              </span>
            </div>
            <div className="flex flex-1 flex-col p-3">
              <div className="max-w-[92%] self-start rounded-2xl rounded-tl-sm bg-white p-3 shadow-sm">
                {rendered ? (
                  <p className="whitespace-pre-wrap break-words text-[12px] leading-[18px] text-slate-900">
                    {rendered.body}
                  </p>
                ) : (
                  placeholder
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col gap-3 p-3 pt-6">
            <span className="text-center text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
              Ex Bank SuperApp · Notifications
            </span>
            <div className="flex gap-2.5 rounded-xl bg-white p-3 shadow-sm">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-bold text-on-primary">
                D
              </div>
              {rendered ? (
                <div className="flex min-w-0 flex-col">
                  <span className="text-[13px] font-semibold">{rendered.subject}</span>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-[12px] leading-[17px] text-slate-700">
                    {rendered.body}
                  </p>
                  <span className="mt-1 text-[10px] text-slate-400">{time}</span>
                </div>
              ) : (
                placeholder
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TestValues({
  variables,
  values,
  setValues,
  preview,
}: {
  variables: Variable[];
  values: Record<string, unknown>;
  setValues: (fn: (v: Record<string, unknown>) => Record<string, unknown>) => void;
  preview: PreviewResult | null;
}) {
  const set = (name: string, value: unknown) => setValues((v) => ({ ...v, [name]: value }));
  const clear = (name: string) =>
    setValues((v) => {
      const next = { ...v };
      delete next[name];
      return next;
    });

  return (
    <Card className="flex flex-col gap-space-sm p-space-md">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold">
          <Icon name="tune" className="text-[17px] text-secondary" /> Test values
        </h3>
        <button
          type="button"
          onClick={() => setValues(() => ({}))}
          className="flex items-center gap-0.5 text-[11px] text-secondary hover:underline"
        >
          <Icon name="restart_alt" className="text-[13px]" /> Use samples for all
        </button>
      </div>
      <p className="text-[11px] text-on-surface-variant">
        Change values to see how the message reacts. Empty fields use a sample. Use “No value” to
        test what happens when the caller doesn't send it (for example {"{{#if …}}"} parts
        disappear).
      </p>
      <div className="grid grid-cols-1 gap-2.5 pt-1 sm:grid-cols-2">
        {variables.map((v) => {
          const given = Object.hasOwn(values, v.name);
          const value = values[v.name];
          const noValue = given && value === null;
          const sample = preview?.values[v.name];
          const inputType =
            v.type === "money" || v.type === "number"
              ? "number"
              : v.type === "datetime"
                ? "datetime-local"
                : "text";
          const display =
            !given || noValue ? "" : v.type === "datetime" ? toLocalInput(value) : String(value);
          const placeholder = noValue
            ? "no value"
            : sample === undefined || sample === null
              ? ""
              : v.type === "datetime"
                ? ""
                : String(sample);

          return (
            <div key={v.name} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-1">
                <label
                  htmlFor={`val-${v.name}`}
                  className="truncate font-mono text-[10px] font-medium text-on-surface-variant"
                >
                  {v.name} <span className="text-outline">({TYPE_LABEL[v.type]})</span>
                </label>
                {given ? (
                  <button
                    type="button"
                    onClick={() => clear(v.name)}
                    className="font-mono text-[10px] text-secondary hover:underline"
                  >
                    {noValue ? "set value" : "use sample"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => set(v.name, null)}
                    className="font-mono text-[10px] text-secondary hover:underline"
                  >
                    no value
                  </button>
                )}
              </div>
              <input
                id={`val-${v.name}`}
                type={inputType}
                step={v.type === "money" ? "0.01" : undefined}
                disabled={noValue}
                value={display}
                placeholder={placeholder}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") return clear(v.name);
                  if (inputType === "number") {
                    const n = Number(raw);
                    return set(v.name, Number.isFinite(n) ? n : raw);
                  }
                  if (v.type === "datetime") {
                    const iso = fromLocalInput(raw);
                    return iso ? set(v.name, iso) : clear(v.name);
                  }
                  set(v.name, raw);
                }}
                className={cx(
                  "w-full rounded bg-surface-container-low px-2 py-1.5 text-[12px] focus:bg-surface-bright focus:outline-none focus:ring-2 focus:ring-secondary",
                  noValue && "italic opacity-60",
                )}
              />
            </div>
          );
        })}
      </div>
    </Card>
  );
}
