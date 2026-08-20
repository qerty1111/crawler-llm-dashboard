import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}

// Card
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverEffect?: boolean;
}
export const Card: React.FC<CardProps> = ({ className, children, hoverEffect = false, ...props }) => (
  <div
    className={cn(
      'bg-surface rounded-xl border border-surface-border p-5 text-slate-100 shadow-lg shadow-black/20',
      hoverEffect && 'transition-all duration-200 hover:border-slate-700 hover:shadow-brand-500/5',
      className
    )}
    {...props}
  >
    {children}
  </div>
);

// Button
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'success';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}
export const Button: React.FC<ButtonProps> = ({
  className,
  variant = 'primary',
  size = 'md',
  disabled,
  children,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-brand-500/50 disabled:opacity-50 disabled:cursor-not-allowed select-none';

  const variants = {
    primary: 'bg-brand-600 hover:bg-brand-500 text-white shadow-md shadow-brand-600/25 active:scale-[0.98]',
    secondary: 'bg-surface-light hover:bg-surface-lighter text-slate-200 border border-surface-border',
    danger: 'bg-rose-600/90 hover:bg-rose-600 text-white shadow-md shadow-rose-600/25 active:scale-[0.98]',
    success: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/25 active:scale-[0.98]',
    outline: 'border border-surface-border bg-transparent hover:bg-surface-light text-slate-300',
    ghost: 'bg-transparent hover:bg-surface-light text-slate-300 hover:text-white',
  };

  const sizes = {
    sm: 'text-xs px-3 py-1.5 gap-1.5',
    md: 'text-sm px-4 py-2 gap-2',
    lg: 'text-base px-6 py-2.5 gap-2.5',
    icon: 'p-2 aspect-square',
  };

  return (
    <button
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};

// Badge
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'outline';
  size?: 'sm' | 'md';
}
export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = 'default',
  size = 'sm',
  children,
  ...props
}) => {
  const variants = {
    default: 'bg-surface-lighter text-slate-300 border border-surface-border',
    success: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
    warning: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
    danger: 'bg-rose-500/15 text-rose-300 border border-rose-500/30',
    info: 'bg-brand-500/15 text-brand-300 border border-brand-500/30',
    purple: 'bg-purple-500/15 text-purple-300 border border-purple-500/30',
    outline: 'border border-surface-border text-slate-400',
  };

  const sizes = {
    sm: 'text-xs px-2 py-0.5 rounded-md font-medium',
    md: 'text-sm px-2.5 py-1 rounded-md font-semibold',
  };

  return (
    <span className={cn('inline-flex items-center gap-1', variants[variant], sizes[size], className)} {...props}>
      {children}
    </span>
  );
};

// Input
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, ...props }, ref) => (
    <div className="w-full space-y-1.5">
      {label && <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">{label}</label>}
      <input
        ref={ref}
        className={cn(
          'w-full bg-surface-light border border-surface-border rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors',
          error && 'border-rose-500 focus:border-rose-500 focus:ring-rose-500',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  )
);
Input.displayName = 'Input';

// Select
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, children, ...props }, ref) => (
    <div className="w-full space-y-1.5">
      {label && <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">{label}</label>}
      <select
        ref={ref}
        className={cn(
          'w-full bg-surface-light border border-surface-border rounded-lg px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors cursor-pointer',
          className
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  )
);
Select.displayName = 'Select';

// Modal
export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl';
}
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'md',
}) => {
  if (!isOpen) return null;

  const maxWidths = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '4xl': 'max-w-4xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div
        className={cn(
          'relative w-full bg-surface border border-surface-border rounded-2xl p-6 shadow-2xl z-10 my-8',
          maxWidths[maxWidth]
        )}
      >
        <div className="flex items-center justify-between pb-4 border-b border-surface-border mb-5">
          <h3 className="text-lg font-bold text-white tracking-tight">{title}</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-surface-light transition-colors"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

// Skeleton
export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('animate-pulse bg-surface-lighter/60 rounded-md', className)} />
);
