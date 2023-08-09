use crate::{program, token::Token};
use anyhow::Result;
use sha2::{Digest, Sha256};
use solana_sdk::pubkey::Pubkey;

#[derive(Debug, Clone, Copy, Eq, PartialEq, Hash, clap::ValueEnum, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Dao {
  Hnt,
}

impl std::fmt::Display for Dao {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    let str = serde_json::to_string(self).map_err(|_| std::fmt::Error)?;
    f.write_str(&str)
  }
}

impl Dao {
  pub fn key(&self) -> Pubkey {
    let mint = match self {
      Self::Hnt => Token::Hnt.mint(),
    };
    let (dao_key, _) = Pubkey::find_program_address(&[b"dao", mint.as_ref()], &program::HSD_PID);
    dao_key
  }

  pub fn data_only_config_key(&self) -> Pubkey {
    let (key, _) = Pubkey::find_program_address(
      &[b"data_only_config", self.key().as_ref()],
      &program::HEM_PID,
    );
    key
  }

  pub fn entity_creator_key(&self) -> Pubkey {
    let (key, _) =
      Pubkey::find_program_address(&[b"entity_creator", self.key().as_ref()], &program::HEM_PID);
    key
  }

  pub fn key_to_asset(&self, entity_key: &[u8]) -> Pubkey {
    let hash = Sha256::digest(entity_key);
    let (key, _) = Pubkey::find_program_address(
      &[b"key_to_asset", self.key().as_ref(), hash.as_ref()],
      &program::HEM_PID,
    );
    key
  }
}

#[derive(Debug, Clone, Copy, Eq, PartialEq, Hash, clap::ValueEnum, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SubDao {
  Iot,
  Mobile,
}

impl std::fmt::Display for SubDao {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    let str = match self {
      Self::Iot => "iot",
      Self::Mobile => "mobile",
    };
    f.write_str(str)
  }
}

impl SubDao {
  pub const fn all() -> [SubDao; 2] {
    [SubDao::Iot, SubDao::Mobile]
  }

  pub fn key(&self) -> Pubkey {
    let mint = self.mint();
    let (subdao_key, _) =
      Pubkey::find_program_address(&[b"sub_dao", mint.as_ref()], &program::HSD_PID);
    subdao_key
  }

  pub fn mint(&self) -> &Pubkey {
    match self {
      Self::Iot => Token::Iot.mint(),
      Self::Mobile => Token::Mobile.mint(),
    }
  }

  pub fn dc_key() -> Pubkey {
    let (key, _) =
      Pubkey::find_program_address(&[b"dc", Token::Dc.mint().as_ref()], &program::DC_PID);
    key
  }

  pub fn delegated_dc_key(&self, router_key: &str) -> Pubkey {
    let hash = Sha256::digest(router_key);
    let (key, _) = Pubkey::find_program_address(
      &[b"delegated_data_credits", self.key().as_ref(), &hash],
      &program::DC_PID,
    );
    key
  }

  pub fn escrow_account_key(&self, delegated_dc_key: &Pubkey) -> Pubkey {
    let (key, _) = Pubkey::find_program_address(
      &[b"escrow_dc_account", delegated_dc_key.as_ref()],
      &program::DC_PID,
    );
    key
  }

  pub fn rewardable_entity_config_key(&self) -> Pubkey {
    let suffix = match self {
      Self::Iot => b"IOT".as_ref(),
      Self::Mobile => b"MOBILE".as_ref(),
    };
    let (key, _) = Pubkey::find_program_address(
      &[b"rewardable_entity_config", self.key().as_ref(), suffix],
      &program::HEM_PID,
    );
    key
  }

  pub fn info_key(&self, entity_key: &[u8]) -> Result<Pubkey> {
    let hash = Sha256::digest(entity_key);
    let config_key = self.rewardable_entity_config_key();
    let prefix = match self {
      Self::Iot => "iot_info",
      Self::Mobile => "mobile_info",
    };
    let (key, _) = Pubkey::find_program_address(
      &[prefix.as_bytes(), config_key.as_ref(), &hash],
      &program::HEM_PID,
    );
    Ok(key)
  }

  pub fn lazy_distributor_key(&self) -> Pubkey {
    let (key, _) = Pubkey::find_program_address(
      &[b"lazy_distributor", self.mint().as_ref()],
      &program::LD_PID,
    );
    key
  }
}
