import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../api/client";
import { Icon, cx } from "./ui";

// ---- Breadcrumbs ---------------------------------------------------------

export interface Crumb {
  label: string;
  to?: string;
  kind?: "namespace" | "service" | "event" | "plain";
}

const CrumbsContext = createContext<(crumbs: Crumb[]) => void>(() => {});

/** Sets the header breadcrumb for the current page. */
export function useCrumbs(crumbs: Crumb[]): void {
  const set = useContext(CrumbsContext);
  const key = JSON.stringify(crumbs);
  useEffect(() => set(crumbs), [key]);
}

// ---- Toasts --------------------------------------------------------------

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});

export const useToast = () => useContext(ToastContext);

function ToastBar({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 flex max-w-md flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cx(
            "flex items-start gap-2 rounded-md px-4 py-3 text-body-md shadow-xl",
            t.kind === "success" && "bg-tertiary-container text-white",
            t.kind === "error" && "bg-error text-on-error",
            t.kind === "info" && "bg-inverse-surface text-inverse-on-surface",
          )}
        >
          <Icon
            name={t.kind === "success" ? "task_alt" : t.kind === "error" ? "error" : "info"}
            className="mt-px"
          />
          <span className="flex-1">{t.message}</span>
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            <Icon name="close" className="text-[16px] opacity-80 hover:opacity-100" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ---- Shell ---------------------------------------------------------------

function NavItem({
  to,
  icon,
  label,
  count,
}: {
  to: string;
  icon: string;
  label: string;
  count?: number;
}) {
  const { pathname } = useLocation();
  // Everything that isn't the snippet manager belongs to the namespace tree.
  const active =
    to === "/snippets" ? pathname.startsWith("/snippets") : !pathname.startsWith("/snippets");
  return (
    <NavLink
      to={to}
      className={cx(
        "focus-ring flex items-center justify-between rounded px-space-sm py-2 transition-colors",
        active
          ? "bg-surface-container-high font-medium text-primary shadow-sm"
          : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface",
      )}
    >
      <span className="flex items-center gap-space-sm">
        <Icon name={icon} />
        <span className="text-[13px] font-medium">{label}</span>
      </span>
      {count !== undefined && (
        <span className="rounded bg-surface-container-highest px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant">
          {count}
        </span>
      )}
    </NavLink>
  );
}

function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  const service = crumbs.find((c) => c.kind === "service");
  const event = crumbs.find((c) => c.kind === "event");
  const toast = useToast();
  const copyKey = () => {
    const key = [service?.label, event?.label].filter(Boolean).join(" / ");
    void navigator.clipboard.writeText(key).then(() => toast(`Copied ${key}`, "info"));
  };

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5">
      {crumbs.map((c, i) => {
        const style = cx(
          "truncate font-mono text-code-sm",
          c.kind === "namespace" && "text-secondary",
          c.kind === "service" && "rounded bg-surface-container px-1.5 py-0.5 text-primary",
          c.kind === "event" &&
            "rounded bg-tertiary-fixed px-1.5 py-0.5 font-semibold text-on-tertiary-fixed-variant",
          (!c.kind || c.kind === "plain") && "text-on-surface-variant",
        );
        return (
          <span key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <span className="text-[11px] text-outline-variant">/</span>}
            {c.to ? (
              <Link to={c.to} className={cx(style, "hover:underline")}>
                {c.label}
              </Link>
            ) : (
              <span className={style}>{c.label}</span>
            )}
          </span>
        );
      })}
      {service && (
        <button
          type="button"
          title="Copy service / event key"
          onClick={copyKey}
          className="ml-1 text-on-surface-variant hover:text-primary"
        >
          <Icon name="content_copy" className="text-[14px]" />
        </button>
      )}
    </nav>
  );
}

export function Layout(): ReactNode {
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [counts, setCounts] = useState<{ namespaces?: number; snippets?: number }>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const { pathname } = useLocation();

  // Refresh the sidebar counters on every navigation (cheap, keeps them honest after saves).
  useEffect(() => {
    Promise.all([api.namespaces(), api.snippets()])
      .then(([n, s]) => setCounts({ namespaces: n.length, snippets: s.length }))
      .catch(() => setCounts({}));
  }, [pathname]);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const showToast = useCallback(
    (message: string, kind: ToastKind = "success") => {
      const id = ++nextId.current;
      setToasts((t) => [...t.slice(-2), { id, message, kind }]);
      setTimeout(() => dismiss(id), kind === "error" ? 8000 : 4500);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={showToast}>
      <CrumbsContext.Provider value={setCrumbs}>
        <aside className="fixed left-0 top-0 z-40 hidden h-full w-60 flex-col justify-between border-r border-outline-variant/40 bg-surface-container-low md:flex">
          <div className="flex flex-col">
            <div className="flex h-14 items-center gap-space-sm border-b border-outline-variant/30 bg-surface-container-lowest px-space-md">
              <div className="flex h-7 w-7 items-center justify-center rounded bg-primary font-bold text-on-primary">
                D
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-[13px] font-bold tracking-tight text-primary">
                  Dashen Bank
                </span>
                <span className="text-[9px] uppercase tracking-wider text-on-surface-variant">
                  SuperApp Console
                </span>
              </div>
            </div>
            <div className="px-space-md pb-space-xs pt-space-md">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                Templates &amp; Content
              </span>
            </div>
            <nav className="flex flex-col gap-1 px-space-sm">
              <NavItem to="/" icon="layers" label="Namespaces" count={counts.namespaces} />
              <NavItem to="/snippets" icon="extension" label="Snippets" count={counts.snippets} />
            </nav>
          </div>
          <div className="border-t border-outline-variant/30 p-space-md">
            <div className="flex items-start gap-2 rounded border border-outline-variant/40 bg-surface-container-low p-space-sm">
              <Icon name="verified_user" className="mt-0.5 text-[16px] text-tertiary-container" />
              <div className="flex flex-col">
                <span className="font-mono text-[10px] font-semibold text-tertiary-container">
                  Checked on save
                </span>
                <span className="text-[11px] text-on-surface-variant">
                  Every template and snippet is validated before it is stored.
                </span>
              </div>
            </div>
          </div>
        </aside>

        <div className="md:pl-60">
          <header className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center gap-space-md border-b border-outline-variant/30 bg-surface-container-lowest px-space-md md:left-60">
            <span className="whitespace-nowrap text-[14px] font-semibold text-on-surface">
              Notification Templates
            </span>
            {crumbs.length > 0 && <div className="h-4 w-px bg-outline-variant/50" />}
            <Breadcrumb crumbs={crumbs} />
          </header>
          <main className="min-h-screen pt-14">
            <Outlet />
          </main>
        </div>
        <ToastBar toasts={toasts} dismiss={dismiss} />
      </CrumbsContext.Provider>
    </ToastContext.Provider>
  );
}
