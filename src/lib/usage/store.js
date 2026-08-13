/**
 * SQL-backed usage tracker for tenant/API-key dashboards and policy enforcement.
 */
import crypto from "crypto";
import { sqlStore } from "../storage/sql-store.js";

function metric() {
  return { count: 0, tokens: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, successful: 0, failed: 0, durationTotal: 0 };
}

function addMetric(target, row) {
  target.count += 1;
  target.tokens += Number(row.tokens) || 0;
  target.inputTokens += Number(row.input_tokens) || 0;
  target.outputTokens += Number(row.output_tokens) || 0;
  target.costUsd += Number(row.cost_usd) || 0;
  target.durationTotal += Number(row.duration_ms) || 0;
  if (row.success) target.successful += 1; else target.failed += 1;
}

function finish(target) {
  return {
    ...target,
    costUsd: Number(target.costUsd.toFixed(8)),
    averageLatencyMs: target.count ? Math.round(target.durationTotal / target.count) : 0,
    successRate: target.count ? Number((target.successful / target.count).toFixed(4)) : 0,
  };
}

function filters({ apiKeyId = null, ownerUserId = null, model = null, provider = null, since = null } = {}) {
  const where = [];
  const params = [];
  if (apiKeyId !== null && apiKeyId !== undefined) { where.push("api_key_id = ?"); params.push(apiKeyId); }
  if (ownerUserId !== null && ownerUserId !== undefined) { where.push("owner_user_id = ?"); params.push(ownerUserId); }
  if (model) { where.push("model = ?"); params.push(model); }
  if (provider) { where.push("provider = ?"); params.push(provider); }
  if (since) { where.push("timestamp >= ?"); params.push(new Date(since).toISOString()); }
  return { sql: where.length ? ` WHERE ${where.join(" AND ")}` : "", params };
}

function queryRows(options = {}) {
  const { sql, params } = filters(options);
  return sqlStore.db.prepare(`SELECT * FROM usage_events${sql} ORDER BY timestamp DESC`).all(...params);
}

export const usageStore = {
  record({ apiKeyId = null, ownerUserId = null, model, provider, tokens, inputTokens = 0, outputTokens = 0, costUsd = 0, duration, success = true, error = null }) {
    const now = new Date();
    const timestamp = now.toISOString();
    const input = Number(inputTokens) || 0;
    const output = Number(outputTokens) || 0;
    const total = Number(tokens) || input + output;
    sqlStore.db.prepare(`
      INSERT INTO usage_events (id, api_key_id, owner_user_id, model, provider, tokens, input_tokens, output_tokens, cost_usd, duration_ms, success, error, timestamp, date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `usage-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
      apiKeyId,
      ownerUserId,
      model || "unknown",
      provider || "unknown",
      total,
      input,
      output,
      Number(costUsd) || 0,
      Math.max(0, Number(duration) || 0),
      success ? 1 : 0,
      error ? String(error).slice(0, 500) : null,
      timestamp,
      timestamp.slice(0, 10),
    );
  },

  getAll(options = {}) { return queryRows(options); },

  getSummary(days = null, options = {}) {
    const since = days ? new Date(Date.now() - days * 86400000).toISOString() : options.since;
    const rows = queryRows({ ...options, since });
    const overall = metric();
    const models = {}, providers = {}, daily = {}, keys = {}, users = {};
    for (const row of rows) {
      addMetric(overall, row);
      if (!models[row.model]) models[row.model] = metric();
      if (!providers[row.provider]) providers[row.provider] = metric();
      if (!daily[row.date]) daily[row.date] = metric();
      addMetric(models[row.model], row);
      addMetric(providers[row.provider], row);
      addMetric(daily[row.date], row);
      if (row.api_key_id != null) { if (!keys[row.api_key_id]) keys[row.api_key_id] = metric(); addMetric(keys[row.api_key_id], row); }
      if (row.owner_user_id != null) { if (!users[row.owner_user_id]) users[row.owner_user_id] = metric(); addMetric(users[row.owner_user_id], row); }
    }
    const recentCutoff = Date.now() - 86400000;
    const last24h = rows.filter((row) => new Date(row.timestamp).getTime() >= recentCutoff).length;
    return {
      total: overall.count,
      successful: overall.successful,
      failed: overall.failed,
      totalTokens: overall.tokens,
      inputTokens: overall.inputTokens,
      outputTokens: overall.outputTokens,
      costUsd: Number(overall.costUsd.toFixed(8)),
      averageLatencyMs: finish(overall).averageLatencyMs,
      successRate: finish(overall).successRate,
      last24h,
      models: Object.fromEntries(Object.entries(models).map(([key, value]) => [key, finish(value)])),
      providers: Object.fromEntries(Object.entries(providers).map(([key, value]) => [key, finish(value)])),
      keys: Object.fromEntries(Object.entries(keys).map(([key, value]) => [key, finish(value)])),
      users: Object.fromEntries(Object.entries(users).map(([key, value]) => [key, finish(value)])),
      daily: Object.entries(daily).sort(([a], [b]) => a.localeCompare(b)).slice(-30).map(([date, value]) => ({ date, ...finish(value) })),
    };
  },

  getWindowUsage({ apiKeyId = null, ownerUserId = null, windowMs = 60000 } = {}) {
    const since = new Date(Date.now() - Math.max(1000, windowMs)).toISOString();
    const rows = queryRows({ apiKeyId, ownerUserId, since });
    return { requests: rows.length, tokens: rows.reduce((sum, row) => sum + (Number(row.tokens) || 0), 0), since };
  },

  clear(options = {}) {
    const { sql, params } = filters(options);
    return sqlStore.db.prepare(`DELETE FROM usage_events${sql}`).run(...params).changes;
  },
};

export { metric, finish };
