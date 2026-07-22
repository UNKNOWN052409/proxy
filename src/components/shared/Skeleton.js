"use client";

import { cn } from "@/lib/cn";

export default function Skeleton({ className, variant = "text" }) {
  const variants = {
    text: "h-4 w-full rounded",
    title: "h-6 w-2/3 rounded",
    avatar: "size-10 rounded-full",
    card: "h-32 rounded-[14px]",
    badge: "h-5 w-16 rounded-full",
  };

  return (
    <div
      className={cn(
        "bg-surface-2/50 animate-shimmer relative overflow-hidden",
        variants[variant] || variants.text,
        className
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent animate-shimmer" />
    </div>
  );
}
