import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useCrumbs } from "../components/Layout";
import {
  Card,
  Chip,
  ErrorState,
  Icon,
  Loading,
  PageHeader,
  SearchInput,
  cx,
} from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { plural } from "../lib/format";

type StatusFilter = "all" | "active" | "off";

export default function ServicesPage() {
  const { namespace = "" } = useParams();
  const navigate = useNavigate();
  useCrumbs([{ label: namespace, kind: "namespace" }]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const { data, error, loading, reload } = useAsync(() => api.services(namespace), [namespace]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter(
      (s) =>
        (s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)) &&
        (status === "all" || (status === "active") === s.active),
    );
  }, [data, query, status]);

  if (error)
    return (
      <ErrorState error={error} onRetry={reload} back={{ to: "/", label: "All namespaces" }} />
    );

  const events = (data ?? []).reduce((n, s) => n + s.eventCount, 0);

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-space-lg px-gutter py-space-lg">
      <PageHeader
        eyebrow="Namespace"
        title={`Services in ${namespace}`}
        badges={
          <span className="rounded bg-surface-container-high px-2 py-0.5 font-mono text-code-lg text-primary-container">
            {namespace}
          </span>
        }
        description="A service is one kind of transaction. Open a service to see its outcome events and edit their message text."
      />

      <Card className="flex flex-col items-stretch justify-between gap-space-md p-space-sm md:flex-row md:items-center">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search by service code or name…"
          className="max-w-md flex-1"
        />
        <div
          className="flex items-center gap-1 rounded bg-surface-container-low p-1"
          role="group"
          aria-label="Status filter"
        >
          {(
            [
              ["all", "All"],
              ["active", "Active"],
              ["off", "Switched off"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              className={cx(
                "focus-ring rounded px-3 py-1 text-body-sm font-medium",
                status === value
                  ? "bg-surface-container-lowest text-primary shadow-sm"
                  : "text-on-surface-variant",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>

      {loading && !data ? (
        <Loading />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-surface-container-low/70 text-caption uppercase text-on-surface-variant">
                  <th className="px-space-md py-space-md">Service code</th>
                  <th className="px-space-md py-space-md">Name</th>
                  <th className="px-space-md py-space-md">Events</th>
                  <th className="px-space-md py-space-md">Status</th>
                  <th className="px-space-md py-space-md text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr
                    key={s.code}
                    onClick={() => navigate(`/services/${s.code}`)}
                    className="group cursor-pointer border-t border-outline-variant/20 hover:bg-surface-container-low/40"
                  >
                    <td className="whitespace-nowrap px-space-md py-3">
                      <span className="flex items-center gap-1.5 font-mono text-code-lg text-secondary group-hover:text-primary">
                        <Icon name="account_tree" className="text-[15px] opacity-70" />
                        {s.code}
                      </span>
                    </td>
                    <td className="px-space-md py-3">
                      <div className="flex flex-col">
                        <span className="font-semibold">{s.name}</span>
                        {s.description && (
                          <span className="text-body-sm text-on-surface-variant">
                            {s.description}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-space-md py-3">
                      <Chip dot>{plural(s.eventCount, "event")}</Chip>
                    </td>
                    <td className="whitespace-nowrap px-space-md py-3">
                      {s.active ? (
                        <Chip tone="success" dot>
                          Active
                        </Chip>
                      ) : (
                        <Chip tone="off" dot>
                          Switched off
                        </Chip>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-space-md py-3 text-right">
                      <Link
                        to={`/services/${s.code}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-body-sm font-semibold text-secondary hover:bg-surface-container group-hover:text-primary"
                      >
                        View events
                        <Icon name="arrow_forward" className="text-[16px]" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && (
            <div className="flex flex-col items-center gap-1 p-space-xl text-center">
              <Icon name="find_in_page" className="text-[36px] text-outline" />
              <span className="text-headline-sm">No services match your filters</span>
              <button
                type="button"
                className="text-body-sm font-medium text-secondary hover:underline"
                onClick={() => {
                  setQuery("");
                  setStatus("all");
                }}
              >
                Clear all filters
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 bg-surface-container-low px-space-md py-3 text-body-sm text-on-surface-variant">
            <Icon name="info" className="text-[16px] text-secondary" />
            Showing <strong className="text-on-surface">{rows.length}</strong> of{" "}
            {plural(data?.length ?? 0, "service")} · {plural(events, "event")} in {namespace}
          </div>
        </Card>
      )}
    </div>
  );
}
