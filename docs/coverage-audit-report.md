# Coverage Audit Report

## Scope and methodology

The audit used Node’s native test runner and native coverage instrumentation. The maintained gateway suite was run with deterministic internal tests for gateway behavior, queueing, rate limiting, retries, SQL persistence, encrypted credentials, and SQL-backed configuration. External provider behavior was not mocked; live upstream checks remain separately recorded in the Prexzy QA report.

## Maintained-suite result

| Metric | Result |
|---|---:|
| Test cases | 116 |
| Passed | 116 |
| Failed | 0 |
| Line coverage | 79.20% |
| Branch coverage | 75.73% |
| Function coverage | 84.42% |

The newly covered SQL persistence scope is substantially stronger: `src/lib/config/store.js` reached 100% line and function coverage, and `src/lib/storage/sql-store.js` reached 100% line and function coverage. The dedicated SQL/config test files each reached 100% line, branch, and function coverage.

## Highest remaining gaps

| Module | Line | Branch | Function | Assessment |
|---|---:|---:|---:|---|
| `gateway/config.js` | 14.99% | 80.00% | 18.75% | Large runtime configuration surface is not exercised by the current gateway unit suite. |
| `gateway/credentials.js` | 29.23% | 50.00% | 20.00% | Credential-pool persistence and rotation paths need isolated filesystem tests. |
| `gateway/health.js` | 23.28% | 81.82% | 33.33% | Provider-health aggregation and background monitoring paths need direct tests. |
| `gateway/providers/bedrock.js` | 34.25% | 68.18% | 46.67% | AWS request construction/error branches need credential-free deterministic tests. |
| `gateway/openai.js` | 40.00% | 83.33% | 45.45% | Error mapping, streaming, and tool fallback branches remain. |
| `gateway/providers/gitlab.js` | 41.30% | 57.14% | 75.00% | GitLab-specific request/response branches remain. |
| `gateway/vision.js` | 44.83% | 70.00% | 80.00% | Additional size, MIME, and fallback rejection branches remain. |
| `gateway/runtime-store.js` | 57.89% | 70.59% | 53.85% | Runtime state migration, persistence, and cleanup branches remain. |

## Full-suite status

The complete historical test glob is not green because legacy account-import tests still expect password-based account records and the old JSON account lookup behavior. Those expectations conflict with the current safe token-only import boundary and SQL provider-account implementation. The maintained gateway suite is green without weakening that boundary.

## Interpretation

The previous approximately 27% figure is no longer the current maintained-suite result. After adding SQL/config integration coverage, the supported gateway scope is at **79.20% line, 75.73% branch, and 84.42% function coverage** with 116/116 maintained tests passing. This is not 100% yet. Reaching 100% across every source file requires additional tests for credential pools, health monitors, runtime configuration, provider adapters, and negative/error branches; it must not be achieved by excluding code or marking untested paths as covered.

## Safe boundary

No tests were added that scrape cookies, convert browser sessions, perform login MITM, import passwords, bypass rate limits, or retain raw upstream response bodies. Live upstream checks remain bounded and redacted.
