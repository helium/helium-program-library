use thiserror::Error;

#[derive(Error, Debug)]
pub enum AtomicDataError {
  #[error("Database error: {0}")]
  DatabaseError(#[from] sqlx::Error),

  #[error("Configuration error: {0}")]
  ConfigError(#[from] config::ConfigError),

  #[error("Serialization error: {0}")]
  SerializationError(#[from] serde_json::Error),

  #[error("Invalid data: {0}")]
  InvalidData(String),

  #[error("Network error: {0}")]
  NetworkError(String),

  #[error("Query validation error: {0}")]
  QueryValidationError(String),

  #[error("Polling bounds error: {0}")]
  PollingBoundsError(String),

  #[error("Unknown error: {0}")]
  Unknown(#[from] anyhow::Error),

  #[error("IO error: {0}")]
  IoError(#[from] std::io::Error),
}
