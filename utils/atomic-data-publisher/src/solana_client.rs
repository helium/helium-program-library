use anyhow::Result;
use reqwest::Client;
use serde_json::{json, Value};
use std::time::Duration;
use tracing::{debug, error, info};

use crate::config::SolanaConfig;
use crate::errors::AtomicDataError;

#[derive(Debug, Clone)]
pub struct SolanaClientWrapper {
  client: Client,
  config: SolanaConfig,
}

impl SolanaClientWrapper {
  pub fn new(config: SolanaConfig) -> Result<Self> {
    info!("Initializing Solana RPC client with endpoint: {}", config.rpc_url);

    let timeout = Duration::from_secs(config.timeout_seconds);
    let client = Client::builder()
      .timeout(timeout)
      .build()?;

    Ok(Self { client, config })
  }

    /// Get the current Solana block height
  pub async fn get_current_block_height(&self) -> Result<u64, AtomicDataError> {
    debug!("Fetching current Solana block height from {}", self.config.rpc_url);

    let request_body = json!({
      "jsonrpc": "2.0",
      "id": 1,
      "method": "getSlot"
    });

    match self.client
      .post(&self.config.rpc_url)
      .json(&request_body)
      .send()
      .await
    {
      Ok(response) => {
        if response.status().is_success() {
          match response.json::<Value>().await {
            Ok(json_response) => {
              if let Some(result) = json_response.get("result") {
                if let Some(slot) = result.as_u64() {
                  info!("Current Solana block height: {}", slot);
                  Ok(slot)
                } else {
                  error!("Invalid slot format in response: {:?}", result);
                  Err(AtomicDataError::SolanaRpcError("Invalid slot format".to_string()))
                }
              } else {
                error!("No result in RPC response: {:?}", json_response);
                Err(AtomicDataError::SolanaRpcError("No result in response".to_string()))
              }
            }
            Err(e) => {
              error!("Failed to parse JSON response: {}", e);
              Err(AtomicDataError::SolanaRpcError(format!("JSON parse error: {}", e)))
            }
          }
        } else {
          error!("HTTP error from Solana RPC: {}", response.status());
          Err(AtomicDataError::SolanaRpcError(format!("HTTP error: {}", response.status())))
        }
      }
      Err(e) => {
        error!("Failed to fetch Solana block height: {}", e);
        Err(AtomicDataError::SolanaRpcError(e.to_string()))
      }
    }
  }

    /// Health check the Solana RPC connection
  pub async fn health_check(&self) -> Result<(), AtomicDataError> {
    debug!("Performing Solana RPC health check");

    let request_body = json!({
      "jsonrpc": "2.0",
      "id": 1,
      "method": "getHealth"
    });

    match self.client
      .post(&self.config.rpc_url)
      .json(&request_body)
      .send()
      .await
    {
      Ok(response) => {
        if response.status().is_success() {
          debug!("Solana RPC health check passed");
          Ok(())
        } else {
          error!("Solana RPC health check failed with status: {}", response.status());
          Err(AtomicDataError::SolanaRpcError(format!("Health check failed: {}", response.status())))
        }
      }
      Err(e) => {
        error!("Solana RPC health check failed: {}", e);
        Err(AtomicDataError::SolanaRpcError(format!("Health check error: {}", e)))
      }
    }
  }

  /// Get RPC endpoint URL
  pub fn get_rpc_url(&self) -> &str {
    &self.config.rpc_url
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_solana_client_creation() {
    let config = SolanaConfig {
      rpc_url: "https://api.mainnet-beta.solana.com".to_string(),
      timeout_seconds: 30,
    };

    let client = SolanaClientWrapper::new(config);
    assert!(client.is_ok());
  }

  #[tokio::test]
  async fn test_get_block_height() {
    let config = SolanaConfig {
      rpc_url: "https://api.mainnet-beta.solana.com".to_string(),
      timeout_seconds: 30,
    };

    let client = SolanaClientWrapper::new(config).unwrap();

    // This test might fail if the RPC is down, but that's expected
    match client.get_current_block_height().await {
      Ok(height) => {
        assert!(height > 0);
        println!("Current block height: {}", height);
      }
      Err(e) => {
        println!("RPC call failed (expected in some environments): {}", e);
      }
    }
  }
}
