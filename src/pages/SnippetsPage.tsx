import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiRequestError, api } from "../api/client";
import type { FieldError, Issue, SnippetWithUsage, TemplateIssues } from "../api/types";
import { useCrumbs, useToast } from "../components/Layout";
import { TagText } from "../components/TagText";
import {
  Button,
  Card,
  Chip,
  ErrorState,
  Icon,
  Loading,
  Notice,
  SearchInput,
  cx,
} from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import {
  CHANNEL_META,
  LIMITS,
  SNIPPET_KEY_PATTERN,
  editorPath,
  plural,
  relativeTime,
  slotLabel,
} from "../lib/format";

export default function SnippetsPage() {
  const { key } = useParams();
  const isNew = key === "new";
  useCrumbs([
    { label: "Snippets", to: "/snippets", kind: "plain" },
    ...(key ? [{ label: isNew ? "New snippet" : key, kind: "plain" as const }] : []),
  ]);
  const [query, setQuery] = useState("");
  const { data, error, loading, reload } = useAsync(() => api.snippets(), []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter(
      (s) =>
        s.key.toLowerCase().includes(q) ||
        (s.description ?? "").toLowerCase().includes(q) ||
        s.body.toLowerCase().includes(q),
    );
  }, [data, query]);

  if (error) return <ErrorState error={error} onRetry={reload} />;

  const selected = data?.find((s) => s.key === key);

  return (
    <div className="flex w-full flex-col">
      <div className="border-b border-outline-variant/30 bg-surface-container-lowest p-space-lg">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-space-md md:flex-row md:items-center">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-space-sm">
              <Icon name="extension" className="text-[24px] text-primary" />
              <h1 className="text-headline-lg text-on-surface">Reusable snippets</h1>
            </div>
            <p className="max-w-3xl text-body-md text-on-surface-variant">
              Snippets are shared pieces of text (footers, help lines, receipt links) inserted into
              templates with <code className="font-mono text-primary">{"{{> key}}"}</code>. Changing
              a snippet changes every template that uses it, so each save is checked against all of
              them.
            </p>
          </div>
          <Link
            to="/snippets/new"
            className="focus-ring flex flex-shrink-0 items-center gap-1.5 rounded bg-primary px-space-md py-2 text-[13px] font-semibold text-on-primary shadow-sm hover:bg-primary-container"
          >
            <Icon name="add_circle" /> Create new snippet
          </Link>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-start gap-space-md p-space-md xl:grid-cols-12">
        <div className="flex flex-col gap-space-sm xl:col-span-5">
          <Card className="flex flex-col gap-space-xs p-space-sm">
            <div className="flex items-center gap-2 px-space-xs">
              <span className="text-[13px] font-semibold">Snippets directory</span>
              <span className="rounded-full bg-secondary-fixed px-1.5 font-mono text-[10px] text-on-secondary-fixed">
                {data?.length ?? 0} total
              </span>
            </div>
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search by key, description or text…"
            />
          </Card>

          {loading && !data ? (
            <Loading />
          ) : (
            <div className="flex flex-col gap-2">
              {shown.map((s) => (
                <SnippetCard key={s.key} snippet={s} selected={s.key === key} />
              ))}
              {shown.length === 0 && (
                <Card className="p-space-lg text-center text-on-surface-variant">
                  {data?.length
                    ? "No snippets match your search."
                    : "No snippets yet. Create the first one."}
                </Card>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-space-md xl:col-span-7">
          {isNew ? (
            <SnippetEditor key="new" existing={data ?? []} onSaved={reload} />
          ) : selected ? (
            <SnippetEditor
              key={selected.key}
              snippet={selected}
              existing={data ?? []}
              onSaved={reload}
            />
          ) : key && loading ? (
            <Loading />
          ) : key && data ? (
            <ErrorState
              error={
                new ApiRequestError(404, {
                  code: "SNIPPET_NOT_FOUND",
                  message: `Snippet ${key} not found`,
                })
              }
              back={{ to: "/snippets", label: "All snippets" }}
            />
          ) : (
            <Card className="flex flex-col items-center gap-2 p-space-xl text-center">
              <Icon name="touch_app" className="text-[32px] text-outline" />
              <span className="text-headline-sm">Select a snippet to edit it</span>
              <span className="text-body-md text-on-surface-variant">or create a new one.</span>
            </Card>
          )}
          <Notice icon="verified_user" title="Safe by design">
            A snippet change that would break any template is refused, and a snippet can't be
            deleted while templates still use it. Customers never receive a broken or half-filled
            message.
          </Notice>
        </div>
      </div>
    </div>
  );
}

function SnippetCard({ snippet, selected }: { snippet: SnippetWithUsage; selected: boolean }) {
  return (
    <Link
      to={`/snippets/${snippet.key}`}
      className={cx(
        "focus-ring relative overflow-hidden rounded-md p-space-md transition-all",
        selected
          ? "border-2 border-secondary bg-surface-container-lowest shadow-md"
          : "border border-outline-variant/30 bg-surface-container-lowest hover:border-outline-variant",
      )}
    >
      {selected && <div className="absolute bottom-0 left-0 top-0 w-1 bg-secondary" />}
      <span
        className={cx(
          "font-mono text-[13px]",
          selected ? "font-bold text-primary" : "font-semibold",
        )}
      >
        {snippet.key}
      </span>
      {snippet.description && (
        <p className="mt-1 text-[12px] text-on-surface-variant">{snippet.description}</p>
      )}
      <div className="mt-2 line-clamp-2 rounded bg-surface-container-low p-space-xs font-mono text-[11px] text-on-surface-variant">
        <TagText text={snippet.body} />
      </div>
      <div className="mt-2.5 flex items-center justify-between border-t border-outline-variant/20 pt-1 text-[11px]">
        <span
          className={cx(
            "flex items-center gap-1",
            snippet.usedBy.length ? "font-medium text-secondary" : "text-on-surface-variant",
          )}
        >
          <Icon name="link" className="text-[14px]" />
          {snippet.usedBy.length
            ? `Used by ${plural(snippet.usedBy.length, "template")}`
            : "Not used yet"}
        </span>
        <span className="text-[10px] text-on-surface-variant">
          Updated {relativeTime(snippet.updatedAt)}
        </span>
      </div>
    </Link>
  );
}

interface Problem {
  message: string;
  issues?: Issue[];
  broken?: TemplateIssues[];
  fields?: FieldError[];
}

function SnippetEditor({
  snippet,
  existing,
  onSaved,
}: {
  snippet?: SnippetWithUsage;
  existing: SnippetWithUsage[];
  onSaved: () => void;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const isNew = !snippet;
  const [key, setKey] = useState(snippet?.key ?? "");
  const [description, setDescription] = useState(snippet?.description ?? "");
  const [body, setBody] = useState(snippet?.body ?? "");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [warnings, setWarnings] = useState<TemplateIssues[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dirty = isNew
    ? key !== "" || body !== "" || description !== ""
    : body !== snippet.body || description !== (snippet.description ?? "");

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const keyError = !isNew
    ? null
    : key === ""
      ? null
      : !SNIPPET_KEY_PATTERN.test(key)
        ? "Start with a letter and use only letters and digits (no spaces, _ or -)."
        : key.length > LIMITS.snippetKey
          ? `At most ${LIMITS.snippetKey} characters.`
          : existing.some((s) => s.key === key)
            ? "A snippet with this key already exists. Open it to edit it."
            : null;

  const canSave = dirty && !saving && !keyError && key !== "" && body.trim() !== "";
  const usedBy = snippet?.usedBy ?? [];
  const brokenLabels = new Set(problem?.broken?.map((b) => b.template));

  const save = async () => {
    setSaving(true);
    setProblem(null);
    setWarnings([]);
    try {
      const result = await api.saveSnippet(key, { description: description.trim() || null, body });
      toast(
        result.created
          ? `Snippet ${key} created.`
          : `Snippet ${key} saved. ${plural(result.usedBy.length, "template")} use the new text.`,
      );
      setWarnings(result.warnings);
      onSaved();
      if (isNew) navigate(`/snippets/${key}`);
    } catch (e) {
      if (!(e instanceof ApiRequestError)) throw e;
      const { code, message, errors } = e.error;
      setProblem({
        message,
        issues: code === "INVALID_SNIPPET" ? (errors as Issue[]) : undefined,
        broken: code === "SNIPPET_BREAKS_TEMPLATES" ? (errors as TemplateIssues[]) : undefined,
        fields: code === "VALIDATION_FAILED" ? (errors as FieldError[]) : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const revert = () => {
    setBody(snippet?.body ?? "");
    setDescription(snippet?.description ?? "");
    if (isNew) setKey("");
    setProblem(null);
  };

  return (
    <Card className="overflow-hidden shadow-md">
      <div className="flex items-center justify-between border-b border-outline-variant/30 bg-surface-container-low/40 px-space-lg py-space-md">
        <div className="flex flex-col">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
            {isNew ? "New snippet" : "Editing snippet"}
          </span>
          <div className="mt-0.5 flex items-center gap-2">
            <h2 className="font-mono text-headline-md font-bold">{key || "untitled"}</h2>
            {!isNew && (
              <span
                title="Keys can't be renamed: create a new snippet, update the templates, then delete this one."
                className="inline-flex items-center gap-1 rounded bg-surface-container px-2 py-0.5 font-mono text-[11px] text-on-surface-variant"
              >
                <Icon name="lock" className="text-[13px] text-outline" /> Fixed key
              </span>
            )}
          </div>
        </div>
        {dirty && <Chip tone="warning">Unsaved changes</Chip>}
      </div>

      <div className="flex flex-col gap-space-md p-space-lg">
        <div className="grid grid-cols-1 gap-space-md md:grid-cols-3">
          <div>
            <label
              htmlFor="snippet-key"
              className="mb-1 block text-[10px] font-semibold uppercase text-on-surface-variant"
            >
              Snippet key
            </label>
            {isNew ? (
              <>
                <input
                  id="snippet-key"
                  value={key}
                  autoFocus
                  maxLength={LIMITS.snippetKey}
                  onChange={(e) => setKey(e.target.value.trim())}
                  placeholder="smsFooter"
                  className={cx(
                    "w-full rounded border bg-surface-container-lowest px-3 py-2 font-mono text-[12px] focus:outline-none focus:ring-2 focus:ring-secondary",
                    keyError ? "border-error" : "border-outline-variant",
                  )}
                />
                {keyError && <p className="mt-1 text-[11px] text-error">{keyError}</p>}
              </>
            ) : (
              <div className="flex items-center justify-between rounded bg-surface-container-low px-3 py-2 font-mono text-[12px]">
                <span className="select-all">{key}</span>
                <Icon name="vpn_key" className="text-[15px] text-outline" />
              </div>
            )}
          </div>
          <div className="md:col-span-2">
            <label
              htmlFor="snippet-description"
              className="mb-1 block text-[10px] font-semibold uppercase text-on-surface-variant"
            >
              Description (optional)
            </label>
            <input
              id="snippet-description"
              value={description}
              maxLength={LIMITS.description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Feedback line for SMS"
              className="w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-secondary"
            />
          </div>
        </div>

        {problem && <ProblemBanner problem={problem} />}

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="snippet-body"
              className="text-[10px] font-semibold uppercase text-on-surface-variant"
            >
              Snippet text
            </label>
            <span className="font-mono text-[11px] text-on-surface-variant">
              {body.length} / {LIMITS.snippetBody}
            </span>
          </div>
          <div
            className={cx(
              "overflow-hidden rounded border-2 bg-surface-container-lowest",
              problem ? "border-error/60" : "border-outline-variant/40",
            )}
          >
            <div className="flex items-center justify-between border-b border-outline-variant/30 bg-surface-container-low px-3 py-1.5 text-[11px]">
              <span className="flex items-center gap-1.5 font-mono text-on-surface-variant">
                <Icon name="code" className="text-[14px]" /> Same tags as templates, except{" "}
                {"{{> …}}"}
              </span>
              <button
                type="button"
                disabled={!dirty}
                onClick={revert}
                className="rounded bg-surface-container px-2 py-0.5 font-mono text-[10px] font-medium text-primary hover:bg-surface-container-high disabled:opacity-40"
              >
                {isNew ? "Clear" : "Revert to saved"}
              </button>
            </div>
            <textarea
              id="snippet-body"
              value={body}
              maxLength={LIMITS.snippetBody}
              spellCheck={false}
              rows={4}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Share us your feedback: {{feedbackUrl}}"
              className="min-h-[96px] w-full resize-y bg-white p-3 font-mono text-[13px] leading-relaxed focus:outline-none"
            />
          </div>
          <p className="text-[11px] text-on-surface-variant">
            Variables are checked against the event of each template that uses the snippet when you
            save. There is no preview for a snippet on its own: preview a template that uses it.
          </p>
        </div>

        {warnings.length > 0 && (
          <Notice icon="warning" tone="warning" title="Saved, with warnings">
            {warnings.map((w) => (
              <div key={w.template} className="mt-1">
                <span className="font-mono text-code-sm">{w.template}</span>:{" "}
                {w.issues.map((i) => i.message).join(" ")}
              </div>
            ))}
          </Notice>
        )}

        {!isNew && (
          <div className="flex flex-col gap-2 border-t border-outline-variant/30 pt-2">
            <div className="flex items-center gap-1.5">
              <Icon name="account_tree" className="text-[16px] text-primary" />
              <span className="text-[13px] font-bold">
                Templates using this snippet ({usedBy.length})
              </span>
            </div>
            {usedBy.length === 0 && (
              <p className="text-body-sm text-on-surface-variant">
                No template uses it yet. Insert it in a template with {`{{> ${key}}}`}.
              </p>
            )}
            {usedBy.map((slot) => {
              const label = slotLabel(slot);
              const broken = brokenLabels.has(label);
              return (
                <div
                  key={label}
                  className={cx(
                    "flex items-center justify-between rounded border p-2.5",
                    broken
                      ? "border-error/40 bg-error-container/20"
                      : "border-outline-variant/30 bg-surface-container-low",
                  )}
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span
                      className={cx(
                        "flex h-5 w-5 items-center justify-center rounded text-[12px] font-bold",
                        broken
                          ? "bg-error text-on-error"
                          : "bg-surface-container-high text-primary",
                      )}
                    >
                      {broken ? "✕" : <Icon name="description" className="text-[13px]" />}
                    </span>
                    <span className="font-mono text-[12px] font-semibold text-primary">
                      {slot.service}
                    </span>
                    <span className="text-[10px] text-outline-variant">/</span>
                    <span className="font-mono text-[11px] font-medium">{slot.event}</span>
                    <span className="text-[10px] text-outline-variant">/</span>
                    <span className="text-[11px] text-on-surface-variant">{slot.audience}</span>
                    <span className="text-[10px] text-outline-variant">/</span>
                    <span className="rounded bg-surface-container px-1.5 font-mono text-[10px] text-primary">
                      {CHANNEL_META[slot.channel].label}
                    </span>
                  </div>
                  <div className="ml-2 flex flex-shrink-0 items-center gap-2">
                    {broken && <Chip tone="error">Breaks with this edit</Chip>}
                    <Link
                      to={editorPath(slot)}
                      title="Open the template"
                      className="rounded p-1 text-primary hover:text-secondary"
                    >
                      <Icon name="open_in_new" className="text-[15px]" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-col items-center justify-between gap-space-md border-t border-outline-variant/30 pt-space-md sm:flex-row">
          <div className="flex w-full items-center gap-space-sm sm:w-auto">
            <Button variant="primary" icon="save" busy={saving} disabled={!canSave} onClick={save}>
              {isNew ? "Create snippet" : "Save snippet"}
            </Button>
            <Button
              onClick={isNew ? () => navigate("/snippets") : revert}
              disabled={!isNew && !dirty}
            >
              {isNew ? "Cancel" : "Cancel changes"}
            </Button>
          </div>
          {!isNew && (
            <span
              title={
                usedBy.length
                  ? `Used by ${plural(usedBy.length, "template")}. Remove it from them first.`
                  : undefined
              }
            >
              <Button
                variant="danger"
                icon="delete_forever"
                disabled={usedBy.length > 0}
                onClick={() => setConfirmDelete(true)}
              >
                Delete snippet
              </Button>
            </span>
          )}
        </div>
        {!isNew && usedBy.length > 0 && (
          <p className="-mt-2 text-right text-[11px] text-on-surface-variant">
            Delete is blocked while {plural(usedBy.length, "template")} use this snippet.
          </p>
        )}
      </div>

      {confirmDelete && snippet && (
        <DeleteDialog
          snippetKey={snippet.key}
          onClose={() => setConfirmDelete(false)}
          onDeleted={() => {
            setConfirmDelete(false);
            toast(`Snippet ${snippet.key} deleted.`);
            onSaved();
            navigate("/snippets");
          }}
        />
      )}
    </Card>
  );
}

function ProblemBanner({ problem }: { problem: Problem }) {
  return (
    <div className="flex flex-col gap-space-sm rounded-md border-2 border-error/80 bg-error-container/40 p-space-md">
      <div className="flex items-start gap-space-sm">
        <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded bg-error text-on-error">
          <Icon name="warning" className="text-[20px]" />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-[15px] font-bold text-on-error-container">
            {problem.broken
              ? `Save refused: this change would break ${plural(problem.broken.length, "template")}`
              : `Save refused: ${problem.message}`}
          </h3>
          {problem.issues?.map((i, n) => (
            <p key={n} className="text-[13px] text-on-error-container/90">
              {i.message} <span className="font-mono text-code-sm opacity-70">({i.code})</span>
            </p>
          ))}
          {problem.fields?.map((f) => (
            <p key={f.field} className="text-[13px] text-on-error-container/90">
              {f.field}: {f.message}
            </p>
          ))}
          {problem.broken && (
            <>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {problem.broken.map((b) => (
                  <div
                    key={b.template}
                    className="rounded border border-error/30 bg-surface-container-lowest/80 px-2.5 py-1.5"
                  >
                    <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold">
                      <Icon name="cancel" className="text-[16px] text-error" /> {b.template}
                    </span>
                    {b.issues.map((i, n) => (
                      <p key={n} className="ml-6 text-[12px] text-on-error-container">
                        {i.message}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-on-error-container/80">
                Every template that includes this snippet must have every variable it uses. Remove
                the variable, or ask the developers to declare it on those events. Nothing was
                saved.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DeleteDialog({
  snippetKey,
  onClose,
  onDeleted,
}: {
  snippetKey: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; templates?: string[] } | null>(null);

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteSnippet(snippetKey);
      onDeleted();
    } catch (e) {
      if (!(e instanceof ApiRequestError)) throw e;
      setError({
        message: e.error.message,
        templates: e.error.code === "SNIPPET_IN_USE" ? (e.error.errors as string[]) : undefined,
      });
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex w-full max-w-md flex-col gap-space-md rounded-md bg-surface-container-lowest p-space-lg shadow-2xl">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-error-container text-on-error-container">
          <Icon name="warning" className="text-[24px]" />
        </div>
        <div className="flex flex-col gap-1">
          <h3 className="text-[18px] font-bold">Delete snippet {snippetKey}?</h3>
          <p className="text-[13px] text-on-surface-variant">
            This can't be undone. Type{" "}
            <span className="font-mono font-semibold text-on-surface">{snippetKey}</span> to
            confirm.
          </p>
        </div>
        <input
          value={typed}
          autoFocus
          onChange={(e) => setTyped(e.target.value)}
          className="w-full rounded border border-outline-variant px-3 py-2 font-mono text-[12px] focus:outline-none focus:ring-2 focus:ring-error"
        />
        {error && (
          <div className="rounded bg-error-container/40 p-2.5 text-[12px] text-on-error-container">
            {error.message}
            {error.templates?.map((t) => (
              <div key={t} className="font-mono text-code-sm">
                • {t}
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-space-sm">
          <Button onClick={onClose}>Cancel</Button>
          <button
            type="button"
            disabled={typed !== snippetKey || busy}
            onClick={remove}
            className="focus-ring rounded bg-error px-space-md py-2 text-[13px] font-semibold text-on-error hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Yes, delete snippet
          </button>
        </div>
      </div>
    </div>
  );
}
