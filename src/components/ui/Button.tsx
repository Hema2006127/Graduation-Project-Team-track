import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-gradient-to-r from-indigo-600 via-indigo-600 to-blue-600 text-white shadow-sm shadow-indigo-500/25 hover:shadow-md hover:shadow-indigo-500/35 hover:from-indigo-700 hover:to-blue-700 active:scale-[0.98]',
  secondary:
    'bg-white text-slate-700 border border-slate-200/90 hover:bg-slate-50 hover:border-slate-300 shadow-2xs hover:shadow-xs active:scale-[0.98]',
  danger:
    'bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-sm shadow-rose-500/25 hover:shadow-md hover:shadow-rose-500/35 hover:from-rose-700 hover:to-red-700 active:scale-[0.98]',
  success:
    'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm shadow-emerald-500/25 hover:shadow-md hover:shadow-emerald-500/35 hover:from-emerald-700 hover:to-teal-700 active:scale-[0.98]',
  ghost: 'text-slate-600 hover:bg-slate-100/90 hover:text-ink active:scale-[0.98]',
};
const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 rounded-lg text-xs gap-1.5 font-medium',
  md: 'h-10 px-4 rounded-xl text-sm gap-2 font-medium',
  lg: 'h-12 px-5 rounded-xl text-base gap-2.5 font-semibold',
};

/** Classes for links that look like buttons (never nest <button> in <a>). */
export const buttonClass = (variant: Variant = 'primary', size: Size = 'md', className?: string) =>
  clsx(
    'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-all duration-150 cursor-pointer select-none',
    'disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none',
    VARIANTS[variant],
    SIZES[size],
    className,
  );

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={buttonClass(variant, size, className)}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(
        'inline-flex size-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-ink disabled:opacity-40',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
