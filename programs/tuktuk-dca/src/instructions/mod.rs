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

// Use localhost when TESTING environment variable is set
pub const TESTING: bool = std::option_env!("TESTING").is_some();

// The only key a DCA's remote transaction is signed by.
pub const DCA_SIGNER: Pubkey = if TESTING {
  pubkey!("AKnL4NNf3DGWZJS6cPknBuEGnVsV4A4m5tgebLHaRSZ9")
} else {
  pubkey!("dcauByvWqZMRAhPr7Qoadag4XqVS75JyR5zsvqWPWJS")
};

// The only url a DCA's remote transaction is fetched from; the stored url is exactly this value.
pub const DCA_URL: &str = if TESTING {
  "http://localhost:8123/dca"
} else {
  #[cfg(feature = "devnet")]
  {
    "https://tuktuk-dca.web.test-helium.com/dca"
  }
  #[cfg(not(feature = "devnet"))]
  {
    "https://tuktuk-dca.web.helium.io/dca"
  }
};

// The url is copied into fixed 128-byte fields (`DcaV0::dca_url`, `AutoTopOffV0::dca_url`).
const _: () = assert!(DCA_URL.len() <= 128);

// 10000 bps is the whole input, so slippage must stay below it for the swap to have a floor.
pub const MAX_SLIPPAGE_BPS_FROM_ORACLE: u16 = 10000;
