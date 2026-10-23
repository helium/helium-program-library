# Standards: Rust services (`utils/**`, off-chain crates)

- Add context to errors with `anyhow::Context` or a `thiserror` enum that uses `#[from]`. Do not `unwrap()` or `expect()` on input from the network, the chain, or config.
- One failed item does not stop the run. Log it with its id, count it in a metric, and continue. Stop the process only on a startup or config error.
- A cron or crank job is idempotent and resumable, and two instances cannot overlap. A held or skipped job logs at `warn!`, not `debug!` (#1344).
- A checkpoint (slot, block height, cursor) commits with the data it covers. A failed save leaves the checkpoint where it was.
- Put runtime config in YAML or env, not in code or in the image. Name magic numbers as consts.
- Prefer one SQL query to round trips from the app. Keep SQL in `.sql` files. Key a shared table per service.
- Migrations use `CREATE INDEX CONCURRENTLY`, are safe with more than one replica running, and fail the deploy on error.
- A health check checks something real: the database, the RPC, the age of the last processed item.
