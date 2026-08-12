#!/usr/bin/env node
import { refreshGatewayModels } from "../lib/gateway/health.js";

try {
  const result = await refreshGatewayModels();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Gateway model refresh failed");
  process.exit(1);
}
