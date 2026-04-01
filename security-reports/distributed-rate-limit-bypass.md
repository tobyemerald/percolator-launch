# Title
Distributed Rate-Limit Bypass Across Serverless Instances

## Severity
High

## Affected Components
- app/app/api/stats/route.ts
- app/app/api/trader/[wallet]/stats/route.ts
- app/app/api/trader/[wallet]/trades/route.ts
- app/app/api/ideas/route.ts
- app/app/api/applications/route.ts
- app/app/api/devnet-register-mint/route.ts

## Description
Multiple public endpoints enforce request throttling with in-memory Maps keyed by client IP.
In multi-instance/serverless deployments, each instance maintains an independent counter, so distributed request traffic can bypass the intended global threshold.

This is an architectural issue, not a localized bug in one route. Even with correct IP extraction, per-instance state does not provide globally consistent abuse prevention.

## Exploit Scenario
An attacker sends requests in parallel through traffic patterns that hit multiple warm instances. Each instance applies limits independently, allowing effective throughput substantially higher than configured caps.

## Reproduction Steps (Safe)
1. Deploy the app in a horizontally scaled environment (multiple serverless workers/instances).
2. Generate sustained traffic to a rate-limited endpoint from one source IP.
3. Compare observed accepted request rate against configured per-minute thresholds.
4. Observe acceptance above configured cap when traffic is distributed across instances.

## Impact
- Abuse throttles can be bypassed under moderate-to-high concurrency.
- Increased risk of scraping, resource exhaustion, and endpoint degradation.
- Public endpoints become easier to flood despite local per-instance checks.

## Suggested Fix (High-Level)
Adopt centralized/distributed rate limiting for all public endpoints (e.g., Redis-backed sliding window or token bucket) with shared storage across instances, and standardize enforcement in a common middleware/helper.
