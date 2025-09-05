use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tracing::{info, warn};

#[derive(Debug, Clone, Serialize)]
pub struct CircuitBreakerStatus {
  pub is_open: bool,
  pub failure_count: u32,
  pub threshold: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceMetrics {
  pub uptime_seconds: u64,
  pub total_changes_processed: u64,
  pub total_changes_published: u64,
  pub total_errors: u64,
  pub changes_by_table: HashMap<String, TableMetrics>,
  pub ingestor_metrics: IngestorMetrics,
  pub database_metrics: DatabaseMetrics,
  pub circuit_breaker_status: CircuitBreakerMetrics,
  pub performance_metrics: PerformanceMetrics,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableMetrics {
  pub changes_detected: u64,
  pub changes_published: u64,
  pub errors: u64,
  pub last_processed_at: Option<String>,
  pub avg_processing_time_ms: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IngestorMetrics {
  pub total_requests: u64,
  pub successful_requests: u64,
  pub failed_requests: u64,
  pub avg_response_time_ms: f64,
  pub circuit_breaker_trips: u64,
  pub retry_attempts: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseMetrics {
  pub total_queries: u64,
  pub successful_queries: u64,
  pub failed_queries: u64,
  pub avg_query_time_ms: f64,
  pub connection_pool_active: u32,
  pub connection_pool_idle: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CircuitBreakerMetrics {
  pub is_open: bool,
  pub failure_count: u32,
  pub threshold: u32,
  pub total_trips: u64,
  pub time_since_last_trip_seconds: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceMetrics {
  pub avg_polling_cycle_time_ms: f64,
  pub avg_batch_processing_time_ms: f64,
  pub memory_usage_mb: f64,
  pub cpu_usage_percent: f64,
}

#[derive(Debug)]
pub struct MetricsCollector {
  start_time: Instant,

  // Counters
  changes_processed: AtomicU64,
  changes_published: AtomicU64,
  total_errors: AtomicU64,

  // Per-table metrics
  table_metrics: Arc<RwLock<HashMap<String, Arc<TableMetricsInternal>>>>,

  // Ingestor metrics
  ingestor_requests: AtomicU64,
  ingestor_successes: AtomicU64,
  ingestor_failures: AtomicU64,
  ingestor_response_times: Arc<RwLock<Vec<Duration>>>,

  // Database metrics
  db_queries: AtomicU64,
  db_successes: AtomicU64,
  db_failures: AtomicU64,
  db_query_times: Arc<RwLock<Vec<Duration>>>,

  // Performance metrics
  polling_cycle_times: Arc<RwLock<Vec<Duration>>>,
  batch_processing_times: Arc<RwLock<Vec<Duration>>>,
}

#[derive(Debug)]
struct TableMetricsInternal {
  changes_detected: AtomicU64,
  changes_published: AtomicU64,
  errors: AtomicU64,
  last_processed_at: Arc<RwLock<Option<Instant>>>,
  processing_times: Arc<RwLock<Vec<Duration>>>,
}

impl MetricsCollector {
  pub fn new() -> Self {
    Self {
      start_time: Instant::now(),
      changes_processed: AtomicU64::new(0),
      changes_published: AtomicU64::new(0),
      total_errors: AtomicU64::new(0),
      table_metrics: Arc::new(RwLock::new(HashMap::new())),
      ingestor_requests: AtomicU64::new(0),
      ingestor_successes: AtomicU64::new(0),
      ingestor_failures: AtomicU64::new(0),
      ingestor_response_times: Arc::new(RwLock::new(Vec::new())),
      db_queries: AtomicU64::new(0),
      db_successes: AtomicU64::new(0),
      db_failures: AtomicU64::new(0),
      db_query_times: Arc::new(RwLock::new(Vec::new())),
      polling_cycle_times: Arc::new(RwLock::new(Vec::new())),
      batch_processing_times: Arc::new(RwLock::new(Vec::new())),
    }
  }

  pub fn increment_errors(&self) {
    self.total_errors.fetch_add(1, Ordering::Relaxed);
  }

  // Table-specific metrics
  pub async fn record_table_change_detected(&self, table_name: &str) {
    let metrics = self.get_or_create_table_metrics(table_name).await;
    metrics.changes_detected.fetch_add(1, Ordering::Relaxed);
  }

  pub async fn record_table_change_published(&self, table_name: &str, processing_time: Duration) {
    let metrics = self.get_or_create_table_metrics(table_name).await;
    metrics.changes_published.fetch_add(1, Ordering::Relaxed);

    // Update last processed time
    {
      let mut last_processed = metrics.last_processed_at.write().await;
      *last_processed = Some(Instant::now());
    }

    // Record processing time
    {
      let mut times = metrics.processing_times.write().await;
      times.push(processing_time);
      // Keep only last 1000 measurements
      if times.len() > 1000 {
        let len = times.len();
        times.drain(0..len - 1000);
      }
    }
  }

  pub async fn record_table_error(&self, table_name: &str) {
    let metrics = self.get_or_create_table_metrics(table_name).await;
    metrics.errors.fetch_add(1, Ordering::Relaxed);
    self.increment_errors();
  }

  async fn get_or_create_table_metrics(&self, table_name: &str) -> Arc<TableMetricsInternal> {
    let mut table_metrics = self.table_metrics.write().await;

    table_metrics
      .entry(table_name.to_string())
      .or_insert_with(|| {
        Arc::new(TableMetricsInternal {
          changes_detected: AtomicU64::new(0),
          changes_published: AtomicU64::new(0),
          errors: AtomicU64::new(0),
          last_processed_at: Arc::new(RwLock::new(None)),
          processing_times: Arc::new(RwLock::new(Vec::new())),
        })
      })
      .clone()
  }

  // Ingestor metrics
  pub async fn record_ingestor_request(&self, success: bool, response_time: Duration) {
    self.ingestor_requests.fetch_add(1, Ordering::Relaxed);

    if success {
      self.ingestor_successes.fetch_add(1, Ordering::Relaxed);
    } else {
      self.ingestor_failures.fetch_add(1, Ordering::Relaxed);
    }

    // Record response time
    {
      let mut times = self.ingestor_response_times.write().await;
      times.push(response_time);
      // Keep only last 1000 measurements
      if times.len() > 1000 {
        let len = times.len();
        times.drain(0..len - 1000);
      }
    }
  }


  // Database metrics
  pub async fn record_database_query(&self, success: bool, query_time: Duration) {
    self.db_queries.fetch_add(1, Ordering::Relaxed);

    if success {
      self.db_successes.fetch_add(1, Ordering::Relaxed);
    } else {
      self.db_failures.fetch_add(1, Ordering::Relaxed);
    }

    // Record query time
    {
      let mut times = self.db_query_times.write().await;
      times.push(query_time);
      // Keep only last 1000 measurements
      if times.len() > 1000 {
        let len = times.len();
        times.drain(0..len - 1000);
      }
    }
  }

  // Performance metrics
  pub async fn record_polling_cycle_time(&self, cycle_time: Duration) {
    let mut times = self.polling_cycle_times.write().await;
    times.push(cycle_time);
    // Keep only last 100 measurements
          if times.len() > 100 {
        let len = times.len();
        times.drain(0..len - 100);
      }
  }

  pub async fn record_batch_processing_time(&self, processing_time: Duration) {
    let mut times = self.batch_processing_times.write().await;
    times.push(processing_time);
    // Keep only last 100 measurements
          if times.len() > 100 {
        let len = times.len();
        times.drain(0..len - 100);
      }
  }

  // Generate metrics snapshot
  pub async fn _get_metrics(
    &self,
    circuit_breaker_status: Option<CircuitBreakerStatus>,
  ) -> ServiceMetrics {
    let uptime = self.start_time.elapsed().as_secs();

    // Build table metrics
    let mut changes_by_table = HashMap::new();
    {
      let table_metrics = self.table_metrics.read().await;
      for (table_name, metrics) in table_metrics.iter() {
        let last_processed_at = {
          let last_processed = metrics.last_processed_at.read().await;
          last_processed.map(|instant| {
            chrono::DateTime::<chrono::Utc>::from(std::time::SystemTime::now() - instant.elapsed())
              .to_rfc3339()
          })
        };

        let avg_processing_time = {
          let times = metrics.processing_times.read().await;
          if times.is_empty() {
            0.0
          } else {
            times.iter().map(|d| d.as_millis() as f64).sum::<f64>() / times.len() as f64
          }
        };

        changes_by_table.insert(
          table_name.clone(),
          TableMetrics {
            changes_detected: metrics.changes_detected.load(Ordering::Relaxed),
            changes_published: metrics.changes_published.load(Ordering::Relaxed),
            errors: metrics.errors.load(Ordering::Relaxed),
            last_processed_at,
            avg_processing_time_ms: avg_processing_time,
          },
        );
      }
    }

    // Calculate averages
    let avg_ingestor_response_time = {
      let times = self.ingestor_response_times.read().await;
      if times.is_empty() {
        0.0
      } else {
        times.iter().map(|d| d.as_millis() as f64).sum::<f64>() / times.len() as f64
      }
    };

    let avg_db_query_time = {
      let times = self.db_query_times.read().await;
      if times.is_empty() {
        0.0
      } else {
        times.iter().map(|d| d.as_millis() as f64).sum::<f64>() / times.len() as f64
      }
    };

    let avg_polling_cycle_time = {
      let times = self.polling_cycle_times.read().await;
      if times.is_empty() {
        0.0
      } else {
        times.iter().map(|d| d.as_millis() as f64).sum::<f64>() / times.len() as f64
      }
    };

    let avg_batch_processing_time = {
      let times = self.batch_processing_times.read().await;
      if times.is_empty() {
        0.0
      } else {
        times.iter().map(|d| d.as_millis() as f64).sum::<f64>() / times.len() as f64
      }
    };

    ServiceMetrics {
      uptime_seconds: uptime,
      total_changes_processed: self.changes_processed.load(Ordering::Relaxed),
      total_changes_published: self.changes_published.load(Ordering::Relaxed),
      total_errors: self.total_errors.load(Ordering::Relaxed),
      changes_by_table,
      ingestor_metrics: IngestorMetrics {
        total_requests: self.ingestor_requests.load(Ordering::Relaxed),
        successful_requests: self.ingestor_successes.load(Ordering::Relaxed),
        failed_requests: self.ingestor_failures.load(Ordering::Relaxed),
        avg_response_time_ms: avg_ingestor_response_time,
        circuit_breaker_trips: 0,
        retry_attempts: 0,
      },
      database_metrics: DatabaseMetrics {
        total_queries: self.db_queries.load(Ordering::Relaxed),
        successful_queries: self.db_successes.load(Ordering::Relaxed),
        failed_queries: self.db_failures.load(Ordering::Relaxed),
        avg_query_time_ms: avg_db_query_time,
        connection_pool_active: 0, // TODO: Get from sqlx pool
        connection_pool_idle: 0,   // TODO: Get from sqlx pool
      },
      circuit_breaker_status: if let Some(cb_status) = circuit_breaker_status {
        CircuitBreakerMetrics {
          is_open: cb_status.is_open,
          failure_count: cb_status.failure_count,
          threshold: cb_status.threshold,
          total_trips: 0,
          time_since_last_trip_seconds: None, // TODO: Track last trip time
        }
      } else {
        CircuitBreakerMetrics {
          is_open: false,
          failure_count: 0,
          threshold: 0,
          total_trips: 0,
          time_since_last_trip_seconds: None,
        }
      },
      performance_metrics: PerformanceMetrics {
        avg_polling_cycle_time_ms: avg_polling_cycle_time,
        avg_batch_processing_time_ms: avg_batch_processing_time,
        memory_usage_mb: 0.0,   // TODO: Get actual memory usage
        cpu_usage_percent: 0.0, // TODO: Get actual CPU usage
      },
    }
  }

  /// Log metrics summary periodically
  pub async fn log_metrics_summary(&self) {
    let changes_processed = self.changes_processed.load(Ordering::Relaxed);
    let changes_published = self.changes_published.load(Ordering::Relaxed);
    let total_errors = self.total_errors.load(Ordering::Relaxed);
    let uptime = self.start_time.elapsed().as_secs();

    info!(
      "Metrics Summary - Uptime: {}s, Processed: {}, Published: {}, Errors: {}",
      uptime, changes_processed, changes_published, total_errors
    );

    // Log table-specific metrics
    let table_metrics = self.table_metrics.read().await;
    for (table_name, metrics) in table_metrics.iter() {
      let detected = metrics.changes_detected.load(Ordering::Relaxed);
      let published = metrics.changes_published.load(Ordering::Relaxed);
      let errors = metrics.errors.load(Ordering::Relaxed);

      if detected > 0 || published > 0 || errors > 0 {
        info!(
          "Table {}: Detected: {}, Published: {}, Errors: {}",
          table_name, detected, published, errors
        );
      }
    }

    // Warn on high error rates
    if total_errors > 0 && changes_processed > 0 {
      let error_rate = (total_errors as f64 / changes_processed as f64) * 100.0;
      if error_rate > 5.0 {
        warn!("High error rate detected: {:.1}%", error_rate);
      }
    }
  }
}
