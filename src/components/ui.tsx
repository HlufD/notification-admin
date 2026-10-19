import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { ApiRequestError } from "../api/client";

export const cx = (...classes: Array<string | false | null | undefined>): string =>
  classes.filter(Boolean).join(" ");

export function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden className={cx("material-symbols-outlined text-[18px]", className)}>
      {name}
    </span>
  );
}

type Tone = "success" | "off" | "info" | "error" | "warning" | "neutral" | "primary";

const TONES: Record<Tone, string> = {
  success: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
  off: "bg-surface-container-highest text-on-surface-variant",
  info: "bg-secondary-fixed text-on-secondary-fixed",
  error: "bg-error-container text-on-error-container",
  warning: "bg-warning-container text-warning border border-warning-border",
  neutral: "bg-surface-container text-on-surface-variant",
  primary: "bg-surface-container-high text-primary",
};

export function Chip({
  tone = "neutral",
  icon,
  dot,
  children,
  className,
  title,
}: {
  tone?: Tone;
  icon?: string;
  dot?: boolean;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-code-sm whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {icon && <Icon name={icon} className="text-[13px]" />}
      {children}
    </span>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTONS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-container shadow-sm",
  secondary: "bg-surface-container text-on-surface hover:bg-surface-container-high",
  ghost: "text-secondary hover:bg-surface-container",
  danger: "border border-error/50 bg-error-container/20 text-error hover:bg-error-container/40",
};

export function Button({
  variant = "secondary",
  icon,
  busy,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  icon?: string;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      className={cx(
        "focus-ring inline-flex items-center justify-center gap-1.5 rounded px-3 py-2 text-body-md font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        BUTTONS[variant],
        className,
      )}
    >
      {busy ? (
        <Icon name="progress_activity" className="animate-spin text-[16px]" />
      ) : (
        icon && <Icon name={icon} className="text-[16px]" />
      )}
      {children}
    </button>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "rounded-md border border-outline-variant/40 bg-surface-container-lowest",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-space-xl text-on-surface-variant">
      <Icon name="progress_activity" className="animate-spin" />
      <span>{label}</span>
    </div>
  );
}

/** Shows an API error. NOT_FOUND codes get a "go back" link. */
export function ErrorState({
  error,
  onRetry,
  back,
}: {
  error: unknown;
  onRetry?: () => void;
  back?: { to: string; label: string };
}) {
  const api = error instanceof ApiRequestError ? error.error : undefined;
  const notFound = api?.code.endsWith("_NOT_FOUND");
  return (
    <Card className="mx-auto my-space-xl max-w-lg p-space-lg text-center">
      <Icon
        name={notFound ? "search_off" : "error"}
        className={cx("text-[32px]", notFound ? "text-outline" : "text-error")}
      />
      <h2 className="mt-2 text-headline-sm text-on-surface">
        {notFound ? "Not found" : "Something went wrong"}
      </h2>
      <p className="mt-1 text-body-md text-on-surface-variant">
        {api?.message ?? "Unexpected error. Try again."}
      </p>
      <div className="mt-space-md flex justify-center gap-2">
        {back && (
          <Link
            to={back.to}
            className="focus-ring rounded bg-surface-container px-3 py-2 font-semibold text-primary"
          >
            {back.label}
          </Link>
        )}
        {onRetry && !notFound && (
          <Button icon="refresh" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    </Card>
  );
}

export function PageHeader({
  eyebrow,
  title,
  badges,
  description,
  aside,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  badges?: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <Card className="flex flex-col justify-between gap-space-md p-space-lg lg:flex-row lg:items-end">
      <div className="flex max-w-3xl flex-col gap-1">
        {eyebrow && (
          <div className="flex items-center gap-1.5 text-caption uppercase text-on-surface-variant">
            {eyebrow}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-space-sm">
          <h1 className="text-headline-lg text-primary">{title}</h1>
          {badges}
        </div>
        {description && <p className="text-body-md text-on-surface-variant">{description}</p>}
      </div>
      {aside}
    </Card>
  );
}

export function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col rounded bg-surface-container-low px-3 py-1.5">
      <span className="text-caption uppercase text-on-surface-variant">{label}</span>
      <span className="text-headline-sm text-primary">{value}</span>
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={cx("relative", className)}>
      <Icon
        name="search"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline"
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded bg-surface-container-low py-2 pl-9 pr-8 text-body-md placeholder:text-outline focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-secondary"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface"
        >
          <Icon name="close" className="text-[16px]" />
        </button>
      )}
    </div>
  );
}

export function Notice({
  icon,
  title,
  children,
  tone = "info",
}: {
  icon: string;
  title: ReactNode;
  children?: ReactNode;
  tone?: "info" | "warning" | "error";
}) {
  const styles = {
    info: "bg-surface-container-low",
    warning: "bg-warning-container border border-warning-border",
    error: "bg-error-container/40 border border-error/60",
  }[tone];
  const iconStyles = {
    info: "bg-primary-fixed text-primary",
    warning: "bg-warning text-white",
    error: "bg-error text-on-error",
  }[tone];
  return (
    <div className={cx("flex items-start gap-space-md rounded-md p-space-md", styles)}>
      <div
        className={cx("flex h-8 w-8 flex-shrink-0 items-center justify-center rounded", iconStyles)}
      >
        <Icon name={icon} />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-headline-sm text-on-surface">{title}</span>
        {children && <div className="text-body-md text-on-surface-variant">{children}</div>}
      </div>
    </div>
  );
}
