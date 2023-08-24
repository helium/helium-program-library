use lazy_static;
use solana_sdk::pubkey::Pubkey;
use std::result::Result as StdResult;
use std::str::FromStr;

lazy_static::lazy_static! {
  static ref HNT_MINT: Pubkey = Pubkey::from_str("hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux").unwrap();
  static ref HNT_PRICE_KEY: Pubkey = Pubkey::from_str("7moA1i5vQUpfDwSpK6Pw9s56ahB7WFGidtbL2ujWrVvm").unwrap();

  static ref MOBILE_MINT: Pubkey = Pubkey::from_str("mb1eu7TzEc71KxDpsmsKoucSSuuoGLv1drys1oP2jh6").unwrap();
  static ref IOT_MINT: Pubkey = Pubkey::from_str("iotEVVZLEywoTn1QdwNPddxPWszn3zFhEot3MfL9fns").unwrap();
  static ref DC_MINT: Pubkey = Pubkey::from_str("dcuc8Amr83Wz27ZkQ2K9NS6r8zRpf1J6cvArEBDZDmm").unwrap();
  static ref SOL_MINT: Pubkey = Pubkey::default();
}

#[derive(Debug, thiserror::Error)]
pub enum TokenError {
  #[error("Invalid token type: {0}")]
  InvalidToken(String),
}

#[derive(
  Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Copy, clap::ValueEnum, Hash,
)]
#[serde(rename_all = "lowercase")]
pub enum Token {
  Hnt,
  Mobile,
  Iot,
  Dc,
}

impl std::fmt::Display for Token {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    let str = serde_json::to_string(self).map_err(|_| std::fmt::Error)?;
    f.write_str(&str)
  }
}

impl std::str::FromStr for Token {
  type Err = TokenError;
  fn from_str(s: &str) -> StdResult<Self, Self::Err> {
    serde_json::from_str(s).map_err(|_| TokenError::InvalidToken(s.to_string()))
  }
}

impl Token {
  pub fn from_mint(mint: Pubkey) -> Option<Self> {
    let token = match mint {
      mint if mint == *HNT_MINT => Token::Hnt,
      mint if mint == *IOT_MINT => Token::Iot,
      mint if mint == *DC_MINT => Token::Dc,
      mint if mint == *MOBILE_MINT => Token::Mobile,
      _ => return None,
    };

    Some(token)
  }

  pub fn all() -> Vec<Self> {
    vec![Self::Hnt, Self::Iot, Self::Mobile, Self::Dc, Self::Sol]
  }

  pub fn transferrable_value_parser() -> clap::builder::PossibleValuesParser {
    let transferrable = ["iot", "mobile", "hnt", "sol"];
    clap::builder::PossibleValuesParser::new(transferrable)
  }

  pub fn associated_token_adress(&self, address: &Pubkey) -> Pubkey {
    match self {
      Self::Sol => *address,
      _ => spl_associated_token_account::get_associated_token_address(address, self.mint()),
    }
  }

  pub fn associated_token_adresses(address: &Pubkey) -> Vec<Pubkey> {
    Self::all()
      .iter()
      .map(|token| token.associated_token_adress(address))
      .collect::<Vec<_>>()
  }

  pub fn decimals(&self) -> u8 {
    match self {
      Self::Hnt => 8,
      Self::Iot | Self::Mobile => 6,
      Self::Dc => 0,
      Self::Sol => 9,
    }
  }

  pub fn mint(&self) -> &Pubkey {
    match self {
      Self::Hnt => &HNT_MINT,
      Self::Mobile => &MOBILE_MINT,
      Self::Iot => &IOT_MINT,
      Self::Dc => &DC_MINT,
      Self::Sol => &SOL_MINT,
    }
  }

  pub fn price_key(&self) -> Option<&Pubkey> {
    match self {
      Self::Hnt => Some(&HNT_PRICE_KEY),
      _ => None,
    }
  }
}
