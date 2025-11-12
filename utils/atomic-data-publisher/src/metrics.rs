use std::{sync::LazyLock, time::Instant};

use metrics::{counter, describe_histogram, gauge, histogram};

static START_TIME: LazyLock<Instant> = LazyLock::new(Instant::now);

pub fn initialize_metrics() {
  // Initialize all metrics with zero values so they appear in /metrics endpoint
  // This must be called AFTER the Prometheus exporter is installed
  counter!("atomic_data_publisher_errors_total").absolute(0);
  counter!("atomic_data_publisher_changes_published_total").absolute(0);
  counter!("atomic_data_publisher_ingestor_connection_failures_total").absolute(0);
  counter!("atomic_data_publisher_ingestor_retry_attempts_total").absolute(0);
  counter!("atomic_data_publisher_ingestor_publish_failures_total").absolute(0);
  counter!("atomic_data_publisher_protobuf_build_failures_total").absolute(0);

  // Initialize histograms (they'll show up after first recording)
  describe_histogram!(
    "atomic_data_publisher_database_query_duration_seconds",
    "Duration of database queries in seconds"
  );
  describe_histogram!(
    "atomic_data_publisher_publish_duration_seconds",
    "Duration of publishing in seconds"
  );

  // Initialize the uptime gauge
  gauge!("atomic_data_publisher_uptime_seconds").set(0.0);
}

pub fn increment_errors() {
  counter!("atomic_data_publisher_errors_total").increment(1);
}

pub fn increment_published() {
  counter!("atomic_data_publisher_changes_published_total").increment(1);
}

pub fn increment_ingestor_connection_failures() {
  counter!("atomic_data_publisher_ingestor_connection_failures_total").increment(1);
}

pub fn increment_ingestor_retry_attempts() {
  counter!("atomic_data_publisher_ingestor_retry_attempts_total").increment(1);
}

pub fn increment_ingestor_publish_failures() {
  counter!("atomic_data_publisher_ingestor_publish_failures_total").increment(1);
}

pub fn increment_protobuf_build_failures() {
  counter!("atomic_data_publisher_protobuf_build_failures_total").increment(1);
}

pub fn observe_database_query_duration(duration: f64) {
  histogram!("atomic_data_publisher_database_query_duration_seconds").record(duration);
}

pub fn observe_publish_duration(duration: f64) {
  histogram!("atomic_data_publisher_publish_duration_seconds").record(duration);
}

pub fn update_uptime() {
  let uptime = START_TIME.elapsed().as_secs() as f64;
  gauge!("atomic_data_publisher_uptime_seconds").set(uptime);
}
