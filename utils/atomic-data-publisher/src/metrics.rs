use prometheus::{register_counter, register_gauge, register_histogram, Counter, Encoder, Gauge, Histogram, TextEncoder};
use std::sync::Arc;
use std::time::Instant;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tracing::{error, info, debug};

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

    loop {
      tokio::select! {
        result = listener.accept() => {
          match result {
            Ok((stream, _)) => {
              let metrics = self.clone();
              tokio::spawn(async move {
                if let Err(e) = handle_connection(stream, metrics).await {
                  debug!("Connection error: {}", e);
                }
              });
            }
            Err(e) => {
              error!("Failed to accept connection: {}", e);
            }
          }
        }
        _ = shutdown_rx.changed() => {
          info!("Metrics server shutdown");
          break;
        }
      }
    }

    Ok(())
  }
}

async fn handle_connection(mut stream: TcpStream, metrics: Arc<MetricsCollector>) -> anyhow::Result<()> {
  let mut buffer = [0; 1024];
  let n = stream.read(&mut buffer).await?;
  let request = String::from_utf8_lossy(&buffer[..n]);

  // Simple HTTP request parsing - just check if it's GET /metrics
  if request.starts_with("GET /metrics") {
    // Update uptime before serving metrics
    let uptime = metrics.start_time.elapsed().as_secs() as f64;
    metrics.uptime_seconds.set(uptime);

    // Generate metrics
    let metric_families = prometheus::gather();
    let encoder = TextEncoder::new();
    let mut buffer = Vec::new();

    match encoder.encode(&metric_families, &mut buffer) {
      Ok(_) => {
        let metrics_output = String::from_utf8(buffer).unwrap_or_else(|_| "Failed to encode metrics".to_string());
        let response = format!(
          "HTTP/1.1 200 OK\r\nContent-Type: text/plain; version=0.0.4; charset=utf-8\r\nContent-Length: {}\r\n\r\n{}",
          metrics_output.len(),
          metrics_output
        );
        stream.write_all(response.as_bytes()).await?;
      }
      Err(_) => {
        let error_response = "HTTP/1.1 500 Internal Server Error\r\nContent-Length: 21\r\n\r\nFailed to get metrics";
        stream.write_all(error_response.as_bytes()).await?;
      }
    }
  } else {
    // Return 404 for non-metrics requests
    let not_found = "HTTP/1.1 404 Not Found\r\nContent-Length: 9\r\n\r\nNot Found";
    stream.write_all(not_found.as_bytes()).await?;
  }

  Ok(())
}