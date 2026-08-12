import net from "node:net";

export const DEFAULT_PORT = 2018;
export const DEFAULT_MAX_ATTEMPTS = 20;

function normalizePort(value, fallback = DEFAULT_PORT) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : fallback;
}

function maxAttempts(value) {
  const attempts = Number(value);
  return Number.isInteger(attempts) && attempts > 0 && attempts <= 100 ? attempts : DEFAULT_MAX_ATTEMPTS;
}

export function canListen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const probe = net.createServer();
    const finish = (available) => {
      probe.removeAllListeners();
      try { probe.close(); } catch {}
      resolve(available);
    };
    probe.once("error", () => finish(false));
    probe.listen({ port, host, exclusive: true }, () => finish(true));
  });
}

export async function findAvailablePort({ preferredPort = process.env.PORT || process.env.GATEWAY_PORT, host = "127.0.0.1", attempts = process.env.PORT_FALLBACK_MAX_ATTEMPTS } = {}) {
  const start = normalizePort(preferredPort);
  const limit = maxAttempts(attempts);
  for (let offset = 0; offset < limit && start + offset < 65536; offset += 1) {
    const port = start + offset;
    if (await canListen(port, host)) return port;
  }
  throw new Error(`No available localhost port found from ${start} after ${limit} attempts`);
}

export async function listenWithPortFallback(server, { preferredPort, host = "127.0.0.1", attempts } = {}) {
  const port = await findAvailablePort({ preferredPort, host, attempts });
  await new Promise((resolve, reject) => {
    const onError = (error) => { server.removeListener("listening", onListening); reject(error); };
    const onListening = () => { server.removeListener("error", onError); resolve(); };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({ port, host });
  });
  return port;
}

export const __testables = { normalizePort, maxAttempts };
