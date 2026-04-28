# migration-tx-executor

Rust process that executes and monitors the L1 → Solana migration transactions produced by [`migration-service`](../../packages/migration-service). Submits via TPU, tracks sent / failed / retried counts per wallet, and exports the progress as Prometheus metrics so we can watch the migration in flight.

Not currently deployed via the main docker pipeline — run standalone at migration time.
