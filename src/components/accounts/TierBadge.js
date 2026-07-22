"use client";

import { Badge } from "@/components/shared";

/**
 * Tier color configuration
 * Maps tier values to badge variants and visual styles
 */
const TIER_CONFIG = {
  free: {
    variant: "neutral",
    label: "Free",
  },
  pro: {
    variant: "brand",
    label: "Pro",
  },
  enterprise: {
    variant: "success",
    label: "Enterprise",
  },
};

/**
 * TierBadge Component
 * Visual tier indicator with color-coded badges
 *
 * @param {Object} props
 * @param {string} props.tier - Tier level: "free", "pro", or "enterprise"
 * @param {string} props.size - Badge size: "sm", "md", or "lg" (default: "sm")
 * @param {boolean} props.dot - Show status dot indicator (default: false)
 * @param {string} props.className - Additional CSS classes
 */
export default function TierBadge({ tier = "free", size = "sm", dot = false, className }) {
  const tierConfig = TIER_CONFIG[tier?.toLowerCase()] || TIER_CONFIG.free;

  return (
    <Badge variant={tierConfig.variant} size={size} dot={dot} className={className}>
      {tierConfig.label}
    </Badge>
  );
}

/**
 * TierBadgeGroup - Display multiple tier badges together
 */
export function TierBadgeGroup({ tiers = [], size = "sm", className }) {
  if (!tiers || tiers.length === 0) return null;

  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className || ""}`}>
      {tiers.map((tier, idx) => (
        <TierBadge key={`${tier}-${idx}`} tier={tier} size={size} />
      ))}
    </div>
  );
}
