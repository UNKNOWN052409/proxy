"use client";

import { Badge } from "@/components/shared";
import { cn } from "@/lib/cn";

/**
 * Tier color configuration
 * Maps tier values to badge variants and icon colors
 */
const TIER_CONFIG = {
  free: {
    variant: "neutral",
    bgColor: "bg-slate-500/10",
    iconColor: "text-slate-400",
    label: "Free",
  },
  pro: {
    variant: "brand",
    bgColor: "bg-brand-500/10",
    iconColor: "text-brand-400",
    label: "Pro",
  },
  enterprise: {
    variant: "success",
    bgColor: "bg-emerald-500/10",
    iconColor: "text-emerald-400",
    label: "Enterprise",
  },
};

/**
 * Provider icon mapping
 */
const PROVIDER_ICONS = {
  kiro: "account_circle",
  "9router": "router",
  OMNIROUTER: "hub",
  lln: "cloud",
  manual: "edit",
};

/**
 * AccountCard Component
 * Displays account information with tier badge and status indicators
 *
 * @param {Object} props
 * @param {Object} props.account - Account object with id, email, tier, provider, etc.
 * @param {Function} props.onClick - Optional click handler
 * @param {React.ReactNode} props.actions - Optional action buttons
 * @param {string} props.className - Additional CSS classes
 * @param {boolean} props.compact - Use compact layout
 */
export default function AccountCard({
  account,
  onClick,
  actions,
  className,
  compact = false,
}) {
  if (!account) {
    return null;
  }

  const tierConfig = TIER_CONFIG[account.tier] || TIER_CONFIG.free;
  const providerIcon = PROVIDER_ICONS[account.provider] || PROVIDER_ICONS.manual;
  const isActive = account.active !== false; // Default to true if not specified

  // Format display name
  const displayName = account.label || account.email || `Account ${account.id?.slice(0, 8)}`;

  // Format timestamps
  const createdDate = account.createdAt
    ? new Date(account.createdAt).toLocaleDateString()
    : null;

  return (
    <div
      className={cn(
        "group flex items-center gap-3 p-3 rounded-xl bg-surface border border-border-subtle transition-all",
        onClick && "cursor-pointer hover:border-brand-500/30 hover:bg-surface-2",
        className
      )}
      onClick={onClick}
    >
      {/* Icon */}
      <div className={cn("size-10 rounded-xl flex items-center justify-center shrink-0", tierConfig.bgColor)}>
        <span className={cn("material-symbols-outlined text-[22px]", tierConfig.iconColor)}>
          {providerIcon}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Name/Email */}
          <p className="text-sm font-medium text-text-main truncate">
            {displayName}
          </p>

          {/* Status Badge */}
          <Badge variant={isActive ? "success" : "error"} size="sm" dot>
            {isActive ? "Active" : "Inactive"}
          </Badge>

          {/* Tier Badge */}
          <Badge variant={tierConfig.variant} size="sm">
            {tierConfig.label}
          </Badge>

          {/* Provider Badge */}
          {!compact && (
            <Badge variant="neutral" size="sm">
              {account.provider || "manual"}
            </Badge>
          )}
        </div>

        {/* Secondary Info */}
        {!compact && (
          <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
            {account.email && account.label && (
              <span className="truncate">{account.email}</span>
            )}
            {account.email && account.label && createdDate && (
              <span>·</span>
            )}
            {createdDate && (
              <span className="whitespace-nowrap">Added {createdDate}</span>
            )}
            {account.metadata?.sessionKey && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[10px]">key</span>
                  Session key
                </span>
              </>
            )}
          </div>
        )}

        {/* Expiry Warning */}
        {account.expiresAt && (
          <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-400">
            <span className="material-symbols-outlined text-[10px]">schedule</span>
            <span>Expires: {new Date(account.expiresAt).toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      {actions && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}

/**
 * AccountCardSkeleton - Loading state for AccountCard
 */
export function AccountCardSkeleton({ compact = false }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-surface border border-border-subtle animate-pulse">
      <div className="size-10 rounded-xl bg-surface-2 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-32 bg-surface-2 rounded" />
        {!compact && <div className="h-3 w-48 bg-surface-2 rounded" />}
      </div>
    </div>
  );
}

/**
 * AccountCardList - Wrapper for rendering multiple account cards
 */
export function AccountCardList({ accounts, loading, emptyMessage, onAccountClick, renderActions, compact }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <AccountCardSkeleton key={i} compact={compact} />
        ))}
      </div>
    );
  }

  if (!accounts || accounts.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="size-12 rounded-2xl bg-surface-2 flex items-center justify-center mx-auto mb-3">
          <span className="material-symbols-outlined text-[28px] text-text-muted">key_off</span>
        </div>
        <p className="text-sm text-text-muted">{emptyMessage || "No accounts found"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {accounts.map((account) => (
        <AccountCard
          key={account.id}
          account={account}
          onClick={onAccountClick ? () => onAccountClick(account) : undefined}
          actions={renderActions ? renderActions(account) : undefined}
          compact={compact}
        />
      ))}
    </div>
  );
}
