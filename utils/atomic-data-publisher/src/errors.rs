use thiserror::Error;

#[derive(Error, Debug)]
pub enum AtomicDataError {
  #[error("Database error: {0}")]
  DatabaseError(String),

  #[error("Configuration error: {0}")]
  ConfigError(String),

  #[error("Serialization error: {0}")]
  SerializationError(String),

  #[error("Invalid data: {0}")]
  InvalidData(String),

  #[error("Network error: {0}")]
  NetworkError(String),

  #[error("Unknown error: {0}")]
  Unknown(String),
}

impl From<sqlx::Error> for AtomicDataError {
  fn from(err: sqlx::Error) -> Self {
    AtomicDataError::DatabaseError(err.to_string())
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
