"use client";

import { cn } from "@/lib/cn";

export default function Button({ children, variant = "primary", size = "md", icon, fullWidth = false, disabled = false, loading = false, className, ...props }) {
  const variants = {
    primary: "bg-brand-500 hover:bg-brand-600 text-white shadow-[var(--shadow-glow)] hover:shadow-[var(--shadow-glow-intense)]",
    secondary: "bg-surface-2 hover:bg-surface-3 text-text-main border border-border",
    ghost: "bg-transparent hover:bg-surface-2 text-text-muted hover:text-text-main",
    danger: "bg-danger hover:bg-red-600 text-white",
    outline: "bg-transparent border border-brand-500/30 text-brand-500 hover:bg-brand-500/10",
  };

  const sizes = {
    sm: "h-8 px-3 text-xs gap-1.5",
    md: "h-9 px-4 text-sm gap-2",
    lg: "h-11 px-6 text-base gap-2.5",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="inline-block size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : icon ? (
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
