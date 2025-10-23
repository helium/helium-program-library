use anchor_lang::prelude::*;

pub mod check_repay_v0;
pub mod close_dca_v0;
pub mod initialize_dca_v0;
pub mod lend_v0;

pub use check_repay_v0::*;
pub use close_dca_v0::*;
pub use initialize_dca_v0::*;
pub use lend_v0::*;

// Re-export nested version
pub use initialize_dca_v0::InitializeDcaNestedV0;

pub const ASSOCIATED_TOKEN_PROGRAM_ID: Pubkey =
  pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

// Signer for remote transactions
pub const DCA_SIGNER: Pubkey = pubkey!("propu8J469CCZuBxerEm3Yrzx1NDNSFkkn7SYD8MEyz");

// Use localhost when TESTING environment variable is set
pub const TESTING: bool = std::option_env!("TESTING").is_some();

pub const DCA_URL: &str = if TESTING {
  "http://localhost:8123/dca"
} else {
  #[cfg(feature = "devnet")]
  {
    "https://tuktuk-dca.web.test-helium.com"
  }
  #[cfg(not(feature = "devnet"))]
  {
    "https://tuktuk-dca.web.helium.io"
  }
};
