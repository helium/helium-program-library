use anchor_lang::prelude::*;
#[cfg(not(feature = "no-entrypoint"))]
use {default_env::default_env, solana_security_txt::security_txt};

declare_id!("pvr1pJdeAcW6tzFyPRSmkL5Xwysi1Tq79f7KF2XB4zM");

use anchor_spl::token::{Mint, Token, TokenAccount};

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
  name: "Position Voting Rewards",
  project_url: "http://helium.com",
  contacts: "email:hello@helium.foundation",
  policy: "https://github.com/helium/helium-program-library/tree/master/SECURITY.md",


  // Optional Fields
  preferred_languages: "en",
  source_code: "https://github.com/helium/helium-program-library/tree/master/programs/position-voting-rewards",
  source_revision: default_env!("GITHUB_SHA", ""),
  source_release: default_env!("GITHUB_REF_NAME", ""),
  auditors: "Sec3"
}

pub mod create_account;
pub mod error;
pub mod instructions;
pub mod state;
pub mod util;

#[program]
pub mod position_voting_rewards {

  use super::*;
}
