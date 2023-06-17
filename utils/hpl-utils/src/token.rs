// use anchor_spl;
use lazy_static;
use solana_sdk::pubkey::Pubkey;
use std::str::FromStr;

lazy_static::lazy_static! {
  static ref HNT_MINT: Pubkey = Pubkey::from_str("hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux").unwrap();
  static ref MOBILE_MINT: Pubkey = Pubkey::from_str("mb1eu7TzEc71KxDpsmsKoucSSuuoGLv1drys1oP2jh6").unwrap();
  static ref IOT_MINT: Pubkey = Pubkey::from_str("iotEVVZLEywoTn1QdwNPddxPWszn3zFhEot3MfL9fns").unwrap();
  static ref DC_MINT: Pubkey = Pubkey::from_str("dcuc8Amr83Wz27ZkQ2K9NS6r8zRpf1J6cvArEBDZDmm").unwrap();
}

#[derive(Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Copy, Hash)]
#[serde(rename_all = "lowercase")]
pub enum HeliumToken {
  Hnt,
  Mobile,
  Iot,
  Dc,
}

impl HeliumToken {
  pub fn from_mint(mint: Pubkey) -> Option<Self> {
    let token = match mint {
      mint if mint == *HNT_MINT => HeliumToken::Hnt,
      mint if mint == *IOT_MINT => HeliumToken::Iot,
      mint if mint == *DC_MINT => HeliumToken::Dc,
      mint if mint == *MOBILE_MINT => HeliumToken::Mobile,
      _ => return None,
    };

    Some(token)
  }

  pub fn decimals(&self) -> u32 {
    match self {
      Self::Hnt => 8,
      Self::Iot | Self::Mobile => 6,
      Self::Dc => 0,
    }
  }

  pub fn mint(&self) -> &Pubkey {
    match self {
      Self::Hnt => &HNT_MINT,
      Self::Mobile => &MOBILE_MINT,
      Self::Iot => &IOT_MINT,
      Self::Dc => &DC_MINT,
    }
  }
}
