use axum::{extract::State, http::StatusCode, response::{IntoResponse, Response}, routing::get, Router};
use prometheus::{register_counter, register_gauge, register_histogram, Counter, Encoder, Gauge, Histogram, TextEncoder};
use std::sync::Arc;
use std::time::Instant;
use tokio::net::TcpListener;
use tracing::{error, info};

#[derive(Debug)]
pub struct MetricsCollector {
  start_time: Instant,
  changes_published_total: Counter,
  errors_total: Counter,
  ingestor_connection_failures_total: Counter,
  ingestor_retry_attempts_total: Counter,
  ingestor_publish_failures_total: Counter,
  uptime_seconds: Gauge,
  database_query_duration: Histogram,
  publish_duration: Histogram,
}

impl MetricsCollector {
  pub fn new() -> anyhow::Result<Self> {
    Ok(Self {
      start_time: Instant::now(),
      changes_published_total: register_counter!("atomic_data_publisher_changes_published_total", "Total changes published")?,
      errors_total: register_counter!("atomic_data_publisher_errors_total", "Total errors")?,
      ingestor_connection_failures_total: register_counter!("atomic_data_publisher_ingestor_connection_failures_total", "Ingestor connection failures")?,
      ingestor_retry_attempts_total: register_counter!("atomic_data_publisher_ingestor_retry_attempts_total", "Ingestor retry attempts")?,
      ingestor_publish_failures_total: register_counter!("atomic_data_publisher_ingestor_publish_failures_total", "Ingestor publish failures")?,
      uptime_seconds: register_gauge!("atomic_data_publisher_uptime_seconds", "Service uptime in seconds")?,
      database_query_duration: register_histogram!("atomic_data_publisher_database_query_duration_seconds", "Database query duration")?,
      publish_duration: register_histogram!("atomic_data_publisher_publish_duration_seconds", "Publish duration")?,
    })
  }

  pub fn increment_errors(&self) {
    self.errors_total.inc();
  }

  pub fn increment_published(&self) {
    self.changes_published_total.inc();
  }

  pub fn increment_ingestor_connection_failures(&self) {
    self.ingestor_connection_failures_total.inc();
  }

  pub fn increment_ingestor_retry_attempts(&self) {
    self.ingestor_retry_attempts_total.inc();
  }

  pub fn increment_ingestor_publish_failures(&self) {
    self.ingestor_publish_failures_total.inc();
  }

  pub fn observe_database_query_duration(&self, duration: f64) {
    self.database_query_duration.observe(duration);
  }

  pub fn observe_publish_duration(&self, duration: f64) {
    self.publish_duration.observe(duration);
  }

  pub async fn serve_metrics(self: Arc<Self>, bind_address: &str, mut shutdown_rx: tokio::sync::watch::Receiver<bool>) -> anyhow::Result<()> {
    let listener = TcpListener::bind(bind_address).await?;
    info!("Metrics server listening on {}", bind_address);

    let app = Router::new().route("/metrics", get(metrics_handler)).with_state(self);

    tokio::select! {
        result = axum::serve(listener, app) => {
            if let Err(e) = result {
                error!("Metrics server error: {}", e);
            }
        }
        _ = shutdown_rx.changed() => {
            info!("Metrics server shutdown");
        }
    }

    Ok(())
  }
}

async fn metrics_handler(State(metrics): State<Arc<MetricsCollector>>) -> Response {
  let uptime = metrics.start_time.elapsed().as_secs() as f64;
  metrics.uptime_seconds.set(uptime);

  match prometheus::gather() {
    metric_families => {
      let encoder = TextEncoder::new();
      let mut buffer = Vec::new();
      if encoder.encode(&metric_families, &mut buffer).is_ok() {
        if let Ok(output) = String::from_utf8(buffer) {
          return (StatusCode::OK, output).into_response();
        }
      }
      (StatusCode::INTERNAL_SERVER_ERROR, "Failed to export metrics").into_response()
    }
  }
}