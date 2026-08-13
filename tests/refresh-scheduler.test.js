import test from "node:test";
import assert from "node:assert/strict";
import { getRefreshSchedulerStatus, startRefreshScheduler, stopRefreshScheduler, __testables } from "../src/lib/gateway/refresh-scheduler.js";

test("refresh scheduler clamps intervals and reports lifecycle state", () => {
  assert.equal(__testables.intervalFrom(1), 60_000);
  assert.equal(__testables.intervalFrom(8 * 24 * 60 * 60 * 1000), 7 * 24 * 60 * 60 * 1000);
  stopRefreshScheduler();
  assert.equal(getRefreshSchedulerStatus().enabled, false);
  const status = startRefreshScheduler({ intervalMs: 60_000 });
  assert.equal(status.enabled, true);
  assert.equal(status.intervalMs, 60_000);
  assert.equal(getRefreshSchedulerStatus().running, false);
  assert.equal(stopRefreshScheduler().enabled, false);
});
