use axum::{
  extract::State,
  http::StatusCode,
  response::{IntoResponse, Response},
  routing::get,
  Router,
};
use prometheus::{
  register_counter, register_gauge, register_histogram, Counter, Encoder, Gauge, Histogram,
  TextEncoder,
};
use std::sync::Arc;
use std::time::Instant;
use tokio::net::TcpListener;
use tower::ServiceBuilder;
use tower_http::cors::CorsLayer;
use tracing::{error, info};

#[derive(Debug)]
pub struct MetricsCollector {
  start_time: Instant,
  pub changes_published_total: Counter,
  pub errors_total: Counter,
  pub ingestor_connection_failures_total: Counter,
  pub ingestor_retry_attempts_total: Counter,
  pub ingestor_publish_failures_total: Counter,
  pub uptime_seconds: Gauge,
  pub database_query_duration: Histogram,
  pub publish_duration: Histogram,
}

impl MetricsCollector {
  pub fn new() -> anyhow::Result<Self> {
    let changes_published_total = register_counter!(
      "atomic_data_publisher_changes_published_total",
      "Total number of changes successfully published"
    )?;

    let errors_total = register_counter!(
      "atomic_data_publisher_errors_total",
      "Total number of errors encountered"
    )?;

    let ingestor_connection_failures_total = register_counter!(
      "atomic_data_publisher_ingestor_connection_failures_total",
      "Total number of ingestor connection failures"
    )?;

    let ingestor_retry_attempts_total = register_counter!(
      "atomic_data_publisher_ingestor_retry_attempts_total",
      "Total number of ingestor retry attempts"
    )?;

    let ingestor_publish_failures_total = register_counter!(
      "atomic_data_publisher_ingestor_publish_failures_total",
      "Total number of ingestor publish failures"
    )?;

    let uptime_seconds = register_gauge!(
      "atomic_data_publisher_uptime_seconds",
      "Service uptime in seconds"
    )?;

    let database_query_duration = register_histogram!(
      "atomic_data_publisher_database_query_duration_seconds",
      "Database query execution time in seconds"
    )?;

    let publish_duration = register_histogram!(
      "atomic_data_publisher_publish_duration_seconds",
      "Time taken to publish changes in seconds"
    )?;

    Ok(Self {
      start_time: Instant::now(),
      changes_published_total,
      errors_total,
      ingestor_connection_failures_total,
      ingestor_retry_attempts_total,
      ingestor_publish_failures_total,
      uptime_seconds,
      database_query_duration,
      publish_duration,
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

  pub fn update_uptime(&self) {
    let uptime = self.start_time.elapsed().as_secs() as f64;
    self.uptime_seconds.set(uptime);
  }

  pub fn log_metrics_summary(&self) {
    let changes_published = self.changes_published_total.get();
    let total_errors = self.errors_total.get();
    let uptime = self.start_time.elapsed().as_secs();

    info!(
      "Metrics Summary - Uptime: {}s, Published: {}, Errors: {}",
      uptime, changes_published, total_errors
    );
  }

  pub fn export_metrics(&self) -> anyhow::Result<String> {
    self.update_uptime();

    let encoder = TextEncoder::new();
    let metric_families = prometheus::gather();
    let mut buffer = Vec::new();
    encoder.encode(&metric_families, &mut buffer)?;
    Ok(String::from_utf8(buffer)?)
  }

  pub async fn serve_metrics(
    self: Arc<Self>,
    bind_address: &str,
    mut shutdown_rx: tokio::sync::watch::Receiver<bool>,
  ) -> anyhow::Result<()> {
    let listener = TcpListener::bind(bind_address).await?;
    info!("Metrics server listening on {}", bind_address);

    let app = Router::new()
      .route("/metrics", get(metrics_handler))
      .with_state(self)
      .layer(ServiceBuilder::new().layer(CorsLayer::permissive()));

    info!("Starting metrics server");

    let server = axum::serve(listener, app);

    tokio::select! {
        result = server => {
            match result {
                Ok(_) => info!("Metrics server stopped normally"),
                Err(e) => error!("Metrics server error: {}", e),
            }
        }
        _ = shutdown_rx.changed() => {
            if *shutdown_rx.borrow() {
                info!("Metrics server received shutdown signal");
            }
        }
    }

    Ok(())
  }
}

async fn metrics_handler(State(metrics): State<Arc<MetricsCollector>>) -> Response {
  match metrics.export_metrics() {
    Ok(metrics_text) => (StatusCode::OK, metrics_text).into_response(),
    Err(e) => {
      error!("Failed to export metrics: {}", e);
      (
        StatusCode::INTERNAL_SERVER_ERROR,
        format!("Failed to export metrics: {}", e),
      )
        .into_response()
    }
  }
}