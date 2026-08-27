import React from 'react';
import { STATUS_META } from '../../lib/telemetry';

export const cx = (...parts) => parts.filter(Boolean).join(' ');

/* ── Surfaces ─────────────────────────────────────────────────────────────── */

export const Card = ({ className, children, ...rest }) => (
  <section
    className={cx(
      'rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.25)]',
      'dark:border-slate-800 dark:bg-slate-900/70',
      className,
    )}
    {...rest}
  >
    {children}
  </section>
);

export const CardHeader = ({ title, subtitle, action, className }) => (
  <div className={cx('flex items-start justify-between gap-3 px-5 pt-4 pb-3', className)}>
    <div className="min-w-0">
      <h2 className="truncate text-sm font-bold text-slate-900 dark:text-white">{title}</h2>
      {subtitle && (
        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
      )}
    </div>
    {action}
  </div>
);

/* ── Status ───────────────────────────────────────────────────────────────── */

export const StatusPill = ({ status, className }) => {
  const meta = STATUS_META[status] ?? STATUS_META.OFFLINE;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
        'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
        className,
      )}
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  );
};

export const LiveDot = ({ label = 'Live', muted = false }) => (
  <span
    className={cx(
      'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold',
      muted
        ? 'border-slate-300 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
        : 'border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
    )}
  >
    <span className="relative flex h-1.5 w-1.5">
      {!muted && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
      )}
      <span
        className={cx(
          'relative inline-flex h-1.5 w-1.5 rounded-full',
          muted ? 'bg-slate-400' : 'bg-emerald-500',
        )}
      />
    </span>
    {label}
  </span>
);

/* ── Buttons ──────────────────────────────────────────────────────────────── */

const buttonStyles = {
  primary:
    'bg-brand-500 text-white hover:bg-brand-400 shadow-sm shadow-emerald-900/20 disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none dark:disabled:bg-slate-800 dark:disabled:text-slate-500',
  secondary:
    'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
  ghost:
    'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white',
  danger:
    'border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300',
};

export const Button = ({ variant = 'secondary', className, children, ...rest }) => (
  <button
    type="button"
    className={cx(
      'inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-colors',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed',
      buttonStyles[variant],
      className,
    )}
    {...rest}
  >
    {children}
  </button>
);

/* ── Forms ────────────────────────────────────────────────────────────────── */

export const Field = ({ label, hint, children }) => (
  <label className="block">
    <span className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
      {label}
    </span>
    {children}
    {hint && <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">{hint}</span>}
  </label>
);

export const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 ' +
  'focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 ' +
  'dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500';

/* ── Empty & loading states ───────────────────────────────────────────────── */

export const EmptyState = ({ icon: Icon, title, description, action, compact = false }) => (
  <div
    className={cx(
      'flex flex-col items-center justify-center text-center',
      compact ? 'gap-1.5 px-4 py-8' : 'gap-2 px-6 py-12',
    )}
  >
    {Icon && (
      <div className="mb-1 rounded-2xl bg-slate-100 p-3 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
        <Icon className="h-5 w-5" />
      </div>
    )}
    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{title}</p>
    {description && (
      <p className="max-w-xs text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        {description}
      </p>
    )}
    {action && <div className="mt-2">{action}</div>}
  </div>
);

export const Skeleton = ({ className }) => (
  <div className={cx('animate-pulse rounded-lg bg-slate-200/80 dark:bg-slate-800', className)} />
);

/* ── Charts (dependency-free) ─────────────────────────────────────────────── */

/**
 * Radial gauge used for fill level and collection progress.
 * `value` is a percentage; `null` renders an empty ring.
 */
export const RadialGauge = ({
  value,
  size = 132,
  stroke = 12,
  color = '#f43f5e',
  track = 'rgba(148,163,184,0.22)',
  children,
}) => {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = value === null || value === undefined ? 0 : Math.max(0, Math.min(100, value));
  const dash = (pct / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={track} strokeWidth={stroke} />
        {/* A round cap on a zero-length arc renders as a stray dot. */}
        {pct > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
            style={{ transition: 'stroke-dasharray 600ms ease' }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
};

/** Horizontal capacity bar. */
export const Meter = ({ value, color = 'bg-emerald-500', className }) => (
  <div className={cx('h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800', className)}>
    <div
      className={cx('h-full rounded-full transition-[width] duration-500', color)}
      style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }}
    />
  </div>
);
