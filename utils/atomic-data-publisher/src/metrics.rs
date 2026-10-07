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

pub fn set_job_held(job_name: &str, held: bool) {
  gauge!("atomic_data_publisher_job_held", "job" => job_name.to_string()).set(if held {
    1.0
  } else {
    0.0
  });
}

pub fn update_uptime() {
  let uptime = START_TIME.elapsed().as_secs() as f64;
  gauge!("atomic_data_publisher_uptime_seconds").set(uptime);
}

#[cfg(test)]
mod tests {
  use metrics::{with_local_recorder, Key, Label};
  use metrics_util::debugging::{DebugValue, DebuggingRecorder, Snapshotter};
  use metrics_util::{CompositeKey, MetricKind};

  use super::set_job_held;

  fn job_held(snapshotter: &Snapshotter, job: &str) -> Option<f64> {
    let key = CompositeKey::new(
      MetricKind::Gauge,
      Key::from_parts(
        "atomic_data_publisher_job_held",
        vec![Label::new("job", job.to_string())],
      ),
    );
    match snapshotter.snapshot().into_hashmap().get(&key) {
      Some((_, _, DebugValue::Gauge(value))) => Some(value.0),
      _ => None,
    }
  }

  #[test]
  fn set_job_held_sets_the_job_gauge() {
    let recorder = DebuggingRecorder::default();
    let snapshotter = recorder.snapshotter();
    let job = "entity_ownership_changes";

    with_local_recorder(&recorder, || set_job_held(job, true));
    assert_eq!(job_held(&snapshotter, job), Some(1.0));

    with_local_recorder(&recorder, || set_job_held(job, false));
    assert_eq!(job_held(&snapshotter, job), Some(0.0));
  }
}
