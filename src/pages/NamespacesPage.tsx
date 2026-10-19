import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useCrumbs } from "../components/Layout";
import {
  Card,
  Chip,
  ErrorState,
  Icon,
  Loading,
  Notice,
  PageHeader,
  SearchInput,
} from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { plural } from "../lib/format";

export default function NamespacesPage() {
  useCrumbs([{ label: "Namespaces", kind: "plain" }]);
  const [query, setQuery] = useState("");

  const { data, error, loading, reload } = useAsync(async () => {
    const namespaces = await api.namespaces();
    const services = await Promise.all(namespaces.map((n) => api.services(n.namespace)));
    return namespaces.map((n, i) => ({ ...n, services: services[i] }));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter(
      (n) =>
        n.namespace.includes(q) ||
        n.services.some(
          (s) => s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q),
        ),
    );
  }, [data, query]);

  if (error) return <ErrorState error={error} onRetry={reload} />;

  const totals = (data ?? []).reduce(
    (t, n) => ({
      services: t.services + n.services.length,
      active: t.active + n.services.filter((s) => s.active).length,
      events: t.events + n.services.reduce((e, s) => e + s.eventCount, 0),
    }),
    { services: 0, active: 0, events: 0 },
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-space-lg p-margin">
      <PageHeader
        eyebrow={
          <>
            <Icon name="domain" className="text-[16px] text-primary" />
            Core domain management
          </>
        }
        title="Namespaces"
        description="Namespaces are the apps that send notifications. Select a namespace to manage the notification templates of its services."
        aside={
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Filter namespaces or services…"
            className="w-full md:w-80"
          />
        }
      />

      {loading && !data ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Total namespaces" value={data?.length ?? 0} icon="hub" />
            <Stat label="Services" value={totals.services} icon="account_balance" />
            <Stat label="Active services" value={totals.active} icon="check_circle" />
            <Stat label="Events" value={totals.events} icon="bolt" />
          </div>

          <div className="grid grid-cols-1 items-stretch gap-space-lg lg:grid-cols-2">
            {filtered.map((n) => {
              const active = n.services.filter((s) => s.active).length;
              const events = n.services.reduce((e, s) => e + s.eventCount, 0);
              return (
                <Card key={n.namespace} className="flex flex-col justify-between p-space-lg">
                  <div className="flex flex-col gap-space-md">
                    <div className="flex items-center gap-space-sm">
                      <div className="flex h-10 w-10 items-center justify-center rounded bg-primary-fixed text-primary">
                        <Icon name="payments" className="text-[22px]" />
                      </div>
                      <h2 className="font-mono text-code-lg font-bold text-primary">
                        {n.namespace}
                      </h2>
                      {active > 0 ? (
                        <Chip tone="success" dot>
                          Active
                        </Chip>
                      ) : (
                        <Chip tone="off" dot>
                          All services off
                        </Chip>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded bg-surface-container-low p-space-sm text-body-sm">
                      <span className="flex items-center gap-1.5">
                        <Icon name="dns" className="text-[16px] text-outline" />
                        {plural(n.services.length, "service")}
                      </span>
                      <span className="text-outline-variant">•</span>
                      <span className="flex items-center gap-1.5">
                        <Icon name="bolt" className="text-[16px] text-outline" />
                        {plural(events, "event")}
                      </span>
                      {active < n.services.length && (
                        <>
                          <span className="text-outline-variant">•</span>
                          <span className="text-on-surface-variant">
                            {n.services.length - active} switched off
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {n.services.slice(0, 6).map((s) => (
                        <span
                          key={s.code}
                          className="rounded bg-surface-container px-1.5 py-0.5 font-mono text-code-sm text-on-surface-variant"
                        >
                          {s.code}
                        </span>
                      ))}
                      {n.services.length > 6 && (
                        <span className="text-body-sm text-on-surface-variant">
                          +{n.services.length - 6} more
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-space-lg flex justify-end">
                    <Link
                      to={`/namespaces/${n.namespace}`}
                      className="focus-ring group inline-flex items-center gap-2 rounded bg-secondary px-space-md py-2 font-semibold text-on-secondary hover:bg-primary"
                    >
                      Open namespace
                      <Icon
                        name="arrow_forward"
                        className="text-[16px] transition-transform group-hover:translate-x-0.5"
                      />
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>

          {data && filtered.length === 0 && (
            <Card className="p-space-xl text-center">
              <Icon name="search_off" className="text-[28px] text-outline" />
              <p className="mt-2 text-headline-sm">
                {data.length === 0 ? "No namespaces yet" : "No namespaces match your filter"}
              </p>
              <p className="text-body-md text-on-surface-variant">
                {data.length === 0
                  ? "Namespaces appear once developers add services to the seed file."
                  : "Try another name or service code."}
              </p>
            </Card>
          )}

          <Notice icon="lightbulb" title="Note for operations admins">
            Services, events and variables are declared by developers in the service definitions.
            You manage the customer-facing text (templates and snippets) without affecting backend
            logic.
          </Notice>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <Card className="flex items-center justify-between p-space-md">
      <div>
        <span className="block text-caption uppercase text-on-surface-variant">{label}</span>
        <span className="text-headline-lg font-bold text-on-surface">{value}</span>
      </div>
      <div className="flex h-10 w-10 items-center justify-center rounded bg-surface-container-high text-primary">
        <Icon name={icon} className="text-[20px]" />
      </div>
    </Card>
  );
}
