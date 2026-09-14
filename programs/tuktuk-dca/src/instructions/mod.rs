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

// `DcaV0::dca_url` is a fixed 128-byte field; a url is copied into it verbatim.
pub const MAX_DCA_URL_LEN: usize = 128;

// 10000 bps is the whole input, so slippage must stay below it for the swap to have a floor.
pub const MAX_SLIPPAGE_BPS_FROM_ORACLE: u16 = 10000;

/// A DCA url addresses the pinned DCA service: `DCA_URL` itself, or a path beneath it.
/// A url that only starts with the same characters, `DCA_URL` followed by anything other
/// than a path separator, names a different host and is not accepted.
pub fn is_pinned_dca_url(url: &str) -> bool {
  url.len() <= MAX_DCA_URL_LEN
    && match url.strip_prefix(DCA_URL) {
      Some(rest) => rest.is_empty() || rest.starts_with('/'),
      None => false,
    }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn pinned_url_accepts_the_service_and_paths_under_it() {
    assert!(is_pinned_dca_url(DCA_URL));
    assert!(is_pinned_dca_url(&format!("{DCA_URL}/")));
    assert!(is_pinned_dca_url(&format!(
      "{DCA_URL}/EsNPf1Beanrb96PmPqLD7V2RGhNrv4UV4nwJamF6ncr3"
    )));
  }

  #[test]
  fn pinned_url_rejects_a_host_sharing_the_prefix() {
    assert!(!is_pinned_dca_url(&format!("{DCA_URL}.other.example")));
    assert!(!is_pinned_dca_url(&format!("{DCA_URL}.other.example/dca")));
    assert!(!is_pinned_dca_url(&format!("{DCA_URL}-other")));
  }

  #[test]
  fn pinned_url_rejects_an_unrelated_host() {
    assert!(!is_pinned_dca_url("https://other.example"));
    assert!(!is_pinned_dca_url(""));
    assert!(!is_pinned_dca_url(&format!(
      "https://other.example/{DCA_URL}"
    )));
  }

  #[test]
  fn pinned_url_rejects_more_than_the_stored_field_holds() {
    let long = format!("{DCA_URL}/{}", "a".repeat(MAX_DCA_URL_LEN));
    assert!(long.len() > MAX_DCA_URL_LEN);
    assert!(!is_pinned_dca_url(&long));
  }
}
