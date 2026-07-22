"use client";

import { cn } from "@/lib/cn";

const variants = {
  success: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  error: "bg-red-500/10 text-red-500 border-red-500/20",
  warning: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  info: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  neutral: "bg-surface-2 text-text-muted border-border",
  brand: "bg-brand-500/10 text-brand-500 border-brand-500/20",
};

const sizes = { sm: "px-2 py-0.5 text-[10px]", md: "px-2.5 py-1 text-xs", lg: "px-3 py-1 text-sm" };

export default function Badge({ children, variant = "neutral", size = "md", dot = false, className }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium border",
        variants[variant] || variants.neutral,
        sizes[size],
        className
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
