import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { EventPage } from "../api/types";
import { useCrumbs } from "../components/Layout";
import { Card, Chip, ErrorState, Icon, Loading, Metric, Notice, cx } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { CHANNEL_META, plural } from "../lib/format";

export default function ServicePage() {
  const { service: code = "" } = useParams();

  const { data, error, loading, reload } = useAsync(async () => {
    const service = await api.service(code);
    const pages = await Promise.all(service.events.map((e) => api.eventPage(service.code, e.code)));
    return { service, pages };
  }, [code]);

  useCrumbs([
    ...(data
      ? [
          {
            label: data.service.namespace,
            to: `/namespaces/${data.service.namespace}`,
            kind: "namespace" as const,
          },
        ]
      : []),
    { label: data?.service.code ?? code.toUpperCase(), kind: "service" },
  ]);

  if (error)
    return (
      <ErrorState error={error} onRetry={reload} back={{ to: "/", label: "All namespaces" }} />
    );
  if (loading && !data) return <Loading />;
  if (!data) return null;

  const { service, pages } = data;
  const slots = pages.flatMap((p) => p.slots);
  const filled = slots.filter((s) => s.status !== "empty").length;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-space-lg px-space-xl py-space-lg">
      <Link
        to={`/namespaces/${service.namespace}`}
        className="focus-ring group inline-flex w-fit items-center gap-2 rounded-full bg-surface-container-low px-space-md py-1.5 text-[13px] font-medium text-primary hover:bg-surface-container-high"
      >
        <Icon name="arrow_back" className="transition-transform group-hover:-translate-x-0.5" />
        Back to {service.namespace} services
      </Link>

      <Card className="relative overflow-hidden p-space-lg">
        <div className="absolute bottom-0 left-0 top-0 w-1.5 bg-primary" />
        <div className="flex flex-col justify-between gap-space-md pl-2 lg:flex-row lg:items-center">
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-space-sm">
              <h1 className="text-[24px] font-bold tracking-tight text-primary">{service.name}</h1>
              <span className="rounded bg-primary-container/15 px-2.5 py-1 font-mono text-code-sm font-semibold text-primary-container">
                {service.code}
              </span>
              {service.active ? (
                <Chip tone="success" dot>
                  Active
                </Chip>
              ) : (
                <Chip tone="off" dot>
                  Switched off
                </Chip>
              )}
            </div>
            {service.description && (
              <p className="max-w-2xl text-[14px] text-on-surface-variant">{service.description}</p>
            )}
          </div>
          <div className="flex gap-space-sm">
            <Metric label="Declared events" value={service.events.length} />
            <Metric label="Templates" value={`${filled} of ${slots.length}`} />
          </div>
        </div>
      </Card>

      {!service.active && (
        <Notice icon="do_not_disturb_on" tone="warning" title="This service is switched off">
          Nothing under it is sent. Templates can be read and previewed but not saved.
        </Notice>
      )}

      <Notice icon="lock" title="Read-only service definition">
        Services, events, variables and audiences are defined by developers. Operations admins write
        and maintain the text of SMS, email and in-app messages.
      </Notice>

      <div className="flex flex-col gap-space-md">
        <div className="flex items-center gap-2">
          <h2 className="text-headline-md font-bold text-primary">Declared events</h2>
          <span className="rounded-full bg-surface-container-high px-2 py-0.5 font-mono text-code-sm font-bold text-primary">
            {service.events.length}
          </span>
        </div>
        {pages.map((page) => (
          <EventCard key={page.event.code} page={page} />
        ))}
        {pages.length === 0 && (
          <Card className="p-space-lg text-center text-on-surface-variant">
            This service declares no events yet.
          </Card>
        )}
      </div>
    </div>
  );
}

function EventCard({ page }: { page: EventPage }) {
  const { event, service, audiences, slots } = page;
  const filled = slots.filter((s) => s.status !== "empty").length;
  const channels = [...new Set(audiences.flatMap((a) => a.channels))];
  const to = `/services/${service.code}/events/${event.code}`;

  return (
    <Card className="flex flex-col gap-space-lg p-space-lg shadow-sm">
      <div className="flex flex-col justify-between gap-space-md lg:flex-row lg:items-center">
        <div className="flex items-start gap-space-md">
          <div
            className={cx(
              "flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md",
              event.active
                ? "bg-tertiary-fixed text-on-tertiary-fixed-variant"
                : "bg-surface-container-highest text-on-surface-variant",
            )}
          >
            <Icon
              name={event.active ? "check_circle" : "do_not_disturb_on"}
              className="text-[28px]"
            />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-[18px] font-bold tracking-tight text-primary">
                {event.code}
              </span>
              {!event.active && (
                <Chip tone="off" dot>
                  Switched off
                </Chip>
              )}
            </div>
            <span className="mt-0.5 text-headline-sm text-on-surface">{event.name}</span>
            {event.description && (
              <p className="mt-1 max-w-xl text-body-md text-on-surface-variant">
                {event.description}
              </p>
            )}
          </div>
        </div>
        <Link
          to={to}
          className="focus-ring inline-flex items-center justify-center gap-2 rounded bg-primary px-space-lg py-3 text-[14px] font-semibold text-on-primary hover:bg-primary-container"
        >
          Open event templates &amp; variables
          <Icon name="arrow_forward" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-space-md md:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-2 rounded bg-surface-container-low p-space-md">
          <span className="flex items-center gap-2 text-caption uppercase text-on-surface-variant">
            <Icon name="group" /> Target audiences
          </span>
          <div className="flex flex-wrap gap-1.5">
            {audiences.map((a) => (
              <span
                key={a.code}
                className="rounded bg-surface-container-highest px-2.5 py-1 font-mono text-code-sm text-primary"
              >
                {a.name} ({a.code})
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 rounded bg-surface-container-low p-space-md">
          <span className="flex items-center gap-2 text-caption uppercase text-on-surface-variant">
            <Icon name="cell_tower" /> Channels allowed
          </span>
          <div className="flex flex-wrap gap-2">
            {channels.map((c) => (
              <span
                key={c}
                className="inline-flex items-center gap-1 rounded bg-surface-container-lowest px-2 py-0.5 font-medium"
              >
                <Icon name={CHANNEL_META[c].icon} className="text-[15px] text-primary" />
                {CHANNEL_META[c].label}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col justify-between gap-2 rounded bg-surface-container-low p-space-md md:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-caption uppercase text-on-surface-variant">
              <Icon name="checklist" /> Progress
            </span>
            <span className="font-mono text-code-sm font-bold text-tertiary-container">
              {filled} of {plural(slots.length, "slot")} filled
            </span>
          </div>
          <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-surface-container-highest">
            {slots.map((s) => (
              <div
                key={`${s.audience}-${s.channel}`}
                className={cx(
                  "h-full flex-1",
                  s.status === "created" && "bg-tertiary-container",
                  s.status === "off" && "bg-outline",
                  s.status === "empty" && "bg-outline-variant/40",
                )}
              />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1 text-center font-mono text-[10px] sm:grid-cols-4">
            {slots.map((s) => (
              <span
                key={`${s.audience}-${s.channel}`}
                className={cx(
                  "rounded py-0.5",
                  s.status === "created" &&
                    "bg-tertiary-fixed font-semibold text-on-tertiary-fixed-variant",
                  s.status === "off" && "bg-surface-container-highest text-on-surface-variant",
                  s.status === "empty" && "bg-surface-container text-outline",
                )}
                title={`${s.audience} · ${CHANNEL_META[s.channel].label}: ${s.status}`}
              >
                {CHANNEL_META[s.channel].label} ({s.audience.charAt(0).toUpperCase()}){" "}
                {s.status === "created" ? "✓" : s.status === "off" ? "off" : "—"}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
