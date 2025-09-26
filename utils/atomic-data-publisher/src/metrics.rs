use metrics::{counter, gauge, histogram};
use std::time::Instant;

#[derive(Debug)]
pub struct MetricsCollector {
  start_time: Instant,
}

impl MetricsCollector {
  pub fn new() -> anyhow::Result<Self> {
    Ok(Self {
      start_time: Instant::now(),
    })
  }

  pub fn initialize_metrics(&self) {
    // Initialize all metrics with zero values so they appear in /metrics endpoint
    // This must be called AFTER the Prometheus exporter is installed
    counter!("atomic_data_publisher_errors_total").absolute(0);
    counter!("atomic_data_publisher_changes_published_total").absolute(0);
    counter!("atomic_data_publisher_ingestor_connection_failures_total").absolute(0);
    counter!("atomic_data_publisher_ingestor_retry_attempts_total").absolute(0);
    counter!("atomic_data_publisher_ingestor_publish_failures_total").absolute(0);

    // Initialize histograms (they'll show up after first recording)
    histogram!("atomic_data_publisher_database_query_duration_seconds");
    histogram!("atomic_data_publisher_publish_duration_seconds");

    // Initialize the uptime gauge
    gauge!("atomic_data_publisher_uptime_seconds").set(0.0);
  }

  pub fn increment_errors(&self) {
    counter!("atomic_data_publisher_errors_total").increment(1);
  }

  pub fn increment_published(&self) {
    counter!("atomic_data_publisher_changes_published_total").increment(1);
  }

  pub fn increment_ingestor_connection_failures(&self) {
    counter!("atomic_data_publisher_ingestor_connection_failures_total").increment(1);
  }

  pub fn increment_ingestor_retry_attempts(&self) {
    counter!("atomic_data_publisher_ingestor_retry_attempts_total").increment(1);
  }

  pub fn increment_ingestor_publish_failures(&self) {
    counter!("atomic_data_publisher_ingestor_publish_failures_total").increment(1);
  }

  pub fn observe_database_query_duration(&self, duration: f64) {
    histogram!("atomic_data_publisher_database_query_duration_seconds").record(duration);
  }

  pub fn observe_publish_duration(&self, duration: f64) {
    histogram!("atomic_data_publisher_publish_duration_seconds").record(duration);
  }

  pub fn update_uptime(&self) {
    let uptime = self.start_time.elapsed().as_secs() as f64;
    gauge!("atomic_data_publisher_uptime_seconds").set(uptime);
  }
}
