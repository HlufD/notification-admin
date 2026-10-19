import { useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Audience, Channel, Slot, Template, Variable } from "../api/types";
import { useCrumbs, useToast } from "../components/Layout";
import {
  Card,
  Chip,
  ErrorState,
  Icon,
  Loading,
  Metric,
  Notice,
  SearchInput,
  cx,
} from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import {
  CHANNELS,
  CHANNEL_META,
  TYPE_HINT,
  TYPE_LABEL,
  percent,
  plural,
  relativeTime,
} from "../lib/format";
import { TagText } from "../components/TagText";

export default function EventPage() {
  const { service = "", event = "" } = useParams();

  const { data, error, loading, reload } = useAsync(async () => {
    const [page, serviceDetail] = await Promise.all([
      api.eventPage(service, event),
      api.service(service),
    ]);
    const filled = page.slots.filter((s) => s.status !== "empty");
    const templates = await Promise.all(
      filled.map((s) =>
        api.getTemplate({
          service: page.service.code,
          event: page.event.code,
          audience: s.audience,
          channel: s.channel,
        }),
      ),
    );
    const bySlot = new Map<string, Template>();
    templates.forEach((t) => t && bySlot.set(`${t.audience}|${t.channel}`, t));
    return { page, serviceActive: serviceDetail.active, bySlot };
  }, [service, event]);

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
          { label: data.page.event.code, kind: "event" },
        ]
      : [
          { label: service.toUpperCase(), kind: "service" },
          { label: event.toUpperCase(), kind: "event" },
        ],
  );

  if (error)
    return (
      <ErrorState
        error={error}
        onRetry={reload}
        back={{ to: `/services/${service}`, label: "Back to service" }}
      />
    );
  if (loading && !data) return <Loading />;
  if (!data) return null;

  const { page, serviceActive, bySlot } = data;
  const created = page.slots.filter((s) => s.status === "created").length;
  const off = page.slots.filter((s) => s.status === "off").length;
  const empty = page.slots.length - created - off;
  const liveChannels = [
    ...new Set(page.slots.filter((s) => s.status === "created").map((s) => s.channel)),
  ];

  return (
    <div className="flex w-full flex-col">
      <div className="bg-surface-container-lowest px-space-lg py-space-md shadow-sm">
        <div className="flex flex-col justify-between gap-space-md lg:flex-row lg:items-center">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-space-sm">
              <h1 className="text-headline-lg text-primary">
                Event: {page.event.code} ({page.event.name})
              </h1>
              {page.event.active && serviceActive ? (
                <Chip tone="success" dot>
                  Active
                </Chip>
              ) : (
                <Chip tone="off" dot>
                  Switched off
                </Chip>
              )}
              <span className="rounded bg-surface-container-high px-2 py-0.5 font-mono text-code-sm text-on-surface-variant">
                {page.service.code} › {page.service.name}
              </span>
            </div>
            <p className="max-w-4xl text-body-md text-on-surface-variant">
              {page.event.description ? `${page.event.description}. ` : ""}Each audience and channel
              has one template. Developers declare the variables and allowed channels; admins write
              the message text.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-space-sm rounded-md bg-surface-container-low p-space-sm">
            <Metric
              label="Coverage"
              value={
                <>
                  {percent(created, page.slots.length)}%{" "}
                  <span className="text-body-sm font-normal text-on-surface-variant">
                    ({created}/{page.slots.length} on)
                  </span>
                </>
              }
            />
            <Metric
              label="Live channels"
              value={
                liveChannels.length
                  ? liveChannels.map((c) => CHANNEL_META[c].label).join(", ")
                  : "None"
              }
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col items-start gap-space-lg p-space-lg xl:flex-row">
        <div className="flex w-full flex-col gap-space-md xl:w-[68%]">
          {(!serviceActive || !page.event.active) && (
            <Notice
              icon="do_not_disturb_on"
              tone="warning"
              title={`This ${serviceActive ? "event" : "service"} is switched off`}
            >
              Nothing is sent for it. Templates can be opened and previewed, but not saved.
            </Notice>
          )}

          <Card className="flex flex-col justify-between gap-space-sm p-space-md sm:flex-row sm:items-end">
            <div>
              <div className="flex items-center gap-2">
                <Icon name="grid_view" className="text-[22px] text-primary" />
                <h2 className="text-headline-md text-primary">Customer notification templates</h2>
              </div>
              <p className="mt-0.5 text-body-md text-on-surface-variant">
                Select a slot to edit its text. Every template is checked against the declared
                variables when it is saved.
              </p>
            </div>
            <div className="flex gap-1.5 text-body-sm text-on-surface-variant">
              <Chip tone="success">{created} on</Chip>
              <Chip tone="off">{off} off</Chip>
              <Chip tone={empty ? "error" : "neutral"}>{empty} empty</Chip>
            </div>
          </Card>

          <SlotMatrix
            audiences={page.audiences}
            slots={page.slots}
            bySlot={bySlot}
            basePath={`/services/${page.service.code}/events/${page.event.code}/templates`}
          />
        </div>

        <VariablesPanel variables={page.variables} />
      </div>
    </div>
  );
}

function SlotMatrix({
  audiences,
  slots,
  bySlot,
  basePath,
}: {
  audiences: Audience[];
  slots: Slot[];
  bySlot: Map<string, Template>;
  basePath: string;
}) {
  const slotMap = new Map(slots.map((s) => [`${s.audience}|${s.channel}`, s]));
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="hidden grid-cols-12 gap-3 bg-surface-container-low px-space-md py-3 text-caption uppercase text-on-surface-variant md:grid">
        <div className="col-span-3 flex items-center gap-1.5">
          <Icon name="group" className="text-[15px]" /> Audience (recipient)
        </div>
        {CHANNELS.map((c) => (
          <div key={c} className="col-span-3 flex items-center gap-1.5">
            <Icon name={CHANNEL_META[c].icon} className="text-[15px]" /> {CHANNEL_META[c].label}
          </div>
        ))}
      </div>
      {audiences.map((a, i) => {
        const own = slots.filter((s) => s.audience === a.code);
        const missing = own.filter((s) => s.status === "empty").length;
        return (
          <div key={a.code}>
            {i > 0 && <div className="h-2 bg-surface-container-low" />}
            <div className="grid grid-cols-12 gap-3 p-space-md">
              <div className="col-span-12 flex flex-col justify-between pr-2 md:col-span-3">
                <div className="flex items-start gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-primary-fixed text-[11px] font-bold uppercase text-on-primary-fixed-variant">
                    {a.code.slice(0, 2)}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-headline-sm text-primary">{a.name}</span>
                    <span className="font-mono text-code-sm text-on-surface-variant">{a.code}</span>
                  </div>
                </div>
                <div className="pt-3">
                  {missing ? (
                    <Chip tone="error" dot>
                      {plural(missing, "slot")} missing text
                    </Chip>
                  ) : (
                    <Chip tone="neutral" dot>
                      All slots have text
                    </Chip>
                  )}
                </div>
              </div>
              {CHANNELS.map((c) => {
                const slot = slotMap.get(`${a.code}|${c}`);
                return (
                  <div key={c} className="col-span-12 sm:col-span-4 md:col-span-3">
                    {slot ? (
                      <SlotCell
                        slot={slot}
                        template={bySlot.get(`${a.code}|${c}`)}
                        to={`${basePath}/${a.code}/${c}`}
                      />
                    ) : (
                      <NotAllowedCell channel={c} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="flex flex-col items-center justify-between gap-space-sm bg-surface-container-low p-space-md sm:flex-row">
        <span className="text-caption uppercase text-on-surface-variant">Slot legend:</span>
        <div className="flex flex-wrap items-center gap-space-md text-body-sm text-on-surface-variant">
          <Legend color="bg-tertiary-container" label="On" hint="sent" />
          <Legend color="bg-outline" label="Off" hint="kept, not sent" />
          <Legend color="bg-secondary" label="Empty" hint="no text yet" />
          <Legend
            color="bg-surface-container-highest"
            label="Not allowed"
            hint="by the service definition"
          />
        </div>
      </div>
    </Card>
  );
}

function Legend({ color, label, hint }: { color: string; label: string; hint: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cx("h-2.5 w-2.5 rounded-full", color)} />
      <strong className="text-on-surface">{label}</strong> ({hint})
    </span>
  );
}

function CellShell({ children, to, muted }: { children: ReactNode; to?: string; muted?: boolean }) {
  const cls = cx(
    "flex h-full flex-col justify-between rounded-md border border-outline-variant/30 p-space-sm transition-colors",
    muted ? "bg-surface-container-low" : "bg-surface-container-lowest",
    to && "group cursor-pointer hover:bg-surface-container-low focus-ring",
  );
  return to ? (
    <Link to={to} className={cls}>
      {children}
    </Link>
  ) : (
    <div className={cx(cls, "cursor-not-allowed select-none opacity-70")}>{children}</div>
  );
}

function SlotCell({ slot, template, to }: { slot: Slot; template?: Template; to: string }) {
  if (slot.status === "empty") {
    return (
      <CellShell to={to}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Chip tone="off" icon="add">
              Empty
            </Chip>
            <span className="font-mono text-code-sm font-medium text-error">Action needed</span>
          </div>
          <div className="flex flex-col items-center gap-2 rounded bg-surface-container-low p-3 py-5 text-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary-fixed text-primary transition-transform group-hover:scale-110">
              <Icon name="post_add" />
            </div>
            <span className="text-headline-sm font-bold text-secondary">+ Create template</span>
            <p className="text-[11px] leading-tight text-on-surface-variant">
              This slot has no text yet, so nothing is sent.
            </p>
          </div>
        </div>
      </CellShell>
    );
  }

  const on = slot.status === "created";
  return (
    <CellShell to={to} muted={!on}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          {on ? (
            <Chip tone="success" icon="check_circle">
              On
            </Chip>
          ) : (
            <Chip tone="off" icon="do_not_disturb_on">
              Off
            </Chip>
          )}
        </div>
        {template && (
          <div className="flex flex-col gap-1 rounded bg-surface-container-low p-2">
            {template.subject && (
              <>
                <span className="text-[9px] font-semibold uppercase tracking-wider text-on-surface-variant">
                  {CHANNEL_META[slot.channel].subject}
                </span>
                <span className="line-clamp-2 text-body-sm font-medium">
                  <TagText text={template.subject} />
                </span>
              </>
            )}
            <span className="line-clamp-3 font-mono text-code-sm leading-snug">
              <TagText text={template.body} />
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5 pt-3">
        <span className="flex items-center gap-1 text-[11px] text-on-surface-variant">
          <span className={cx("h-1.5 w-1.5 rounded-full", on ? "bg-tertiary" : "bg-outline")} />
          {on ? "Sent" : "Not sent"} · Edited {relativeTime(slot.updatedAt)}
        </span>
        <span className="flex items-center gap-1 text-body-sm font-semibold text-secondary group-hover:text-primary">
          Edit template
          <Icon
            name="arrow_forward"
            className="text-[14px] transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </div>
    </CellShell>
  );
}

function NotAllowedCell({ channel }: { channel: Channel }) {
  return (
    <CellShell muted>
      <div className="flex flex-col gap-2">
        <Chip tone="neutral" icon="lock">
          Not allowed
        </Chip>
        <div className="flex flex-col gap-1.5 rounded bg-surface-container p-3">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold">
            <Icon name="block" className="text-[16px] text-on-surface-variant" /> Not available
          </span>
          <p className="text-[11px] leading-relaxed text-on-surface-variant">
            {CHANNEL_META[channel].label} is not allowed for this audience by the service
            definition.
          </p>
        </div>
      </div>
    </CellShell>
  );
}

function VariablesPanel({ variables }: { variables: Variable[] }) {
  const [query, setQuery] = useState("");
  const toast = useToast();
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return variables.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        (v.description ?? "").toLowerCase().includes(q) ||
        v.type.includes(q),
    );
  }, [variables, query]);

  const copy = (tag: string) =>
    void navigator.clipboard
      .writeText(tag)
      .then(() => toast(`Copied ${tag} to the clipboard`, "info"));

  return (
    <div className="flex w-full flex-col gap-space-md xl:w-[32%]">
      <Card className="flex flex-col gap-3 p-space-md">
        <div className="flex items-center gap-2">
          <Icon name="data_object" className="text-[22px] text-secondary" />
          <h3 className="text-headline-sm font-bold text-primary">Event variables</h3>
          <span className="rounded-full bg-secondary-fixed px-2 py-0.5 font-mono text-code-sm font-bold text-on-secondary-fixed">
            {query
              ? `${shown.length} of ${variables.length}`
              : plural(variables.length, "variable")}
          </span>
        </div>
        <p className="text-body-sm text-on-surface-variant">
          Declared in the service definition. Use them in templates as{" "}
          <code className="font-mono text-primary">{"{{name}}"}</code>.
        </p>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Filter by name, type or description…"
        />
      </Card>
      <Card className="flex max-h-[820px] flex-col gap-2 overflow-y-auto p-space-sm">
        {shown.map((v) => (
          <button
            key={v.name}
            type="button"
            onClick={() => copy(`{{${v.name}}}`)}
            className="focus-ring flex flex-col gap-1.5 rounded border border-outline-variant/20 bg-surface-bright p-space-sm text-left hover:bg-surface-container-low"
            title={`Click to copy {{${v.name}}}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-mono text-code-lg font-bold text-primary">
                {v.name}
                <Icon name="content_copy" className="text-[13px] text-on-surface-variant" />
              </span>
              <span className="flex items-center gap-1">
                <span
                  title={TYPE_HINT[v.type]}
                  className={cx(
                    "rounded px-1.5 font-mono text-code-sm",
                    v.type === "money"
                      ? "bg-secondary-fixed text-on-secondary-fixed"
                      : "bg-surface-container-high text-on-surface-variant",
                  )}
                >
                  {TYPE_LABEL[v.type]}
                </span>
                {v.required ? (
                  <span className="rounded bg-error-container px-1.5 font-mono text-code-sm font-semibold text-on-error-container">
                    Required
                  </span>
                ) : (
                  <span className="rounded bg-surface-container px-1.5 font-mono text-code-sm text-on-surface-variant">
                    Optional
                  </span>
                )}
              </span>
            </div>
            {v.description && (
              <p className="text-body-sm text-on-surface-variant">{v.description}</p>
            )}
            {v.type === "datetime" && (
              <p className="font-mono text-code-sm text-on-surface-variant">
                Also {`{{${v.name}.date}}`} and {`{{${v.name}.time}}`}
              </p>
            )}
          </button>
        ))}
        {shown.length === 0 && (
          <p className="p-space-md text-center text-on-surface-variant">No variables match.</p>
        )}
      </Card>
      <div className="flex items-start gap-2.5 rounded-md bg-surface-container-low p-space-md">
        <Icon name="tips_and_updates" className="mt-0.5 text-[20px] text-secondary" />
        <p className="text-body-sm text-on-surface-variant">
          <strong className="text-on-surface">Tip:</strong> click a variable to copy its tag, or
          open a template and click the variable chips to insert them at the cursor. Wrap optional
          variables in <code className="font-mono text-primary">{"{{#if name}}…{{/if}}"}</code> so
          the text reads well when they are missing.
        </p>
      </div>
    </div>
  );
}
