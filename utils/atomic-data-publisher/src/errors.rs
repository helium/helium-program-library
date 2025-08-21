use thiserror::Error;

#[derive(Error, Debug)]
pub enum AtomicDataError {
  #[error("Database error: {0}")]
  DatabaseError(String),

  #[error("Configuration error: {0}")]
  ConfigError(String),

  #[error("HTTP client error: {0}")]
  HttpError(String),

  #[error("Serialization error: {0}")]
  SerializationError(String),

  #[error("Ingestor service error: status={status}, message={message}")]
  IngestorError { status: u16, message: String },

  #[error("Circuit breaker open: {0}")]
  CircuitBreakerOpen(String),

  #[error("Retry exhausted: {0}")]
  RetryExhausted(String),

  #[error("Service unavailable: {0}")]
  ServiceUnavailable(String),

  #[error("Invalid data: {0}")]
  InvalidData(String),

  #[error("Timeout error: {0}")]
  Timeout(String),

  #[error("Unknown error: {0}")]
  Unknown(String),
}

impl From<sqlx::Error> for AtomicDataError {
  fn from(err: sqlx::Error) -> Self {
    AtomicDataError::DatabaseError(err.to_string())
  }
}

impl From<reqwest::Error> for AtomicDataError {
  fn from(err: reqwest::Error) -> Self {
    if err.is_timeout() {
      AtomicDataError::Timeout(err.to_string())
    } else if err.is_connect() {
      AtomicDataError::ServiceUnavailable(err.to_string())
    } else {
      AtomicDataError::HttpError(err.to_string())
    }
  }
}

impl From<serde_json::Error> for AtomicDataError {
  fn from(err: serde_json::Error) -> Self {
    AtomicDataError::SerializationError(err.to_string())
  }
}

impl From<config::ConfigError> for AtomicDataError {
  fn from(err: config::ConfigError) -> Self {
    AtomicDataError::ConfigError(err.to_string())
  }
}

impl From<anyhow::Error> for AtomicDataError {
  fn from(err: anyhow::Error) -> Self {
    AtomicDataError::Unknown(err.to_string())
  }
}
