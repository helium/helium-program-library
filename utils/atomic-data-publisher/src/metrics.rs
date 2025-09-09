use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceMetrics {
  pub uptime_seconds: u64,
  pub total_changes_published: u64,
  pub total_errors: u64,
}

#[derive(Debug)]
pub struct MetricsCollector {
  start_time: Instant,
  changes_published: AtomicU64,
  total_errors: AtomicU64,
  ingestor_connection_failures: AtomicU64,
  ingestor_retry_attempts: AtomicU64,
  ingestor_publish_failures: AtomicU64,
}

impl MetricsCollector {
  pub fn new() -> Self {
    Self {
      start_time: Instant::now(),
      changes_published: AtomicU64::new(0),
      total_errors: AtomicU64::new(0),
      ingestor_connection_failures: AtomicU64::new(0),
      ingestor_retry_attempts: AtomicU64::new(0),
      ingestor_publish_failures: AtomicU64::new(0),
    }
  }

  pub fn increment_errors(&self) {
    self.total_errors.fetch_add(1, Ordering::Relaxed);
  }

  pub fn increment_published(&self) {
    self.changes_published.fetch_add(1, Ordering::Relaxed);
  }

  pub fn increment_ingestor_connection_failures(&self) {
    self
      .ingestor_connection_failures
      .fetch_add(1, Ordering::Relaxed);
  }

  pub fn increment_ingestor_retry_attempts(&self) {
    self.ingestor_retry_attempts.fetch_add(1, Ordering::Relaxed);
  }

  pub fn increment_ingestor_publish_failures(&self) {
    self
      .ingestor_publish_failures
      .fetch_add(1, Ordering::Relaxed);
  }

  pub fn log_metrics_summary(&self) {
    let changes_published = self.changes_published.load(Ordering::Relaxed);
    let total_errors = self.total_errors.load(Ordering::Relaxed);
    let uptime = self.start_time.elapsed().as_secs();

    info!(
      "Metrics Summary - Uptime: {}s, Published: {}, Errors: {}",
      uptime, changes_published, total_errors
    );
  }
}
