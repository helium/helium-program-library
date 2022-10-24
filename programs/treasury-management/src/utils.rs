use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use shared_utils::precise_number::{InnerUint, PreciseNumber};
use std::convert::*;

pub fn precise_supply(mint: &Account<Mint>) -> PreciseNumber {
  precise_supply_amt(mint.supply, mint)
}

fn get_pow_10(decimals: u8) -> PreciseNumber {
  match decimals {
    0 => PreciseNumber::new(1),
    1 => PreciseNumber::new(10),
    2 => PreciseNumber::new(100),
    3 => PreciseNumber::new(1000),
    4 => PreciseNumber::new(10000),
    5 => PreciseNumber::new(100000),
    6 => PreciseNumber::new(1000000),
    7 => PreciseNumber::new(10000000),
    8 => PreciseNumber::new(100000000),
    9 => PreciseNumber::new(1000000000),
    10 => PreciseNumber::new(10000000000),
    11 => PreciseNumber::new(100000000000),
    12 => PreciseNumber::new(1000000000000),
    _ => unreachable!(),
  }
  .unwrap()
}

fn get_u128_pow_10(decimals: u8) -> u128 {
  match decimals {
    0 => 1,
    1 => 10,
    2 => 100,
    3 => 1000,
    4 => 10000,
    5 => 100000,
    6 => 1000000,
    7 => 10000000,
    8 => 100000000,
    9 => 1000000000,
    10 => 10000000000,
    11 => 100000000000,
    12 => 1000000000000,
    _ => unreachable!(),
  }
}

pub fn precise_supply_amt(amt: u64, mint: &Mint) -> PreciseNumber {
  PreciseNumber {
    value: InnerUint::from(amt)
      .checked_mul(InnerUint::from(get_u128_pow_10(12_u8 - mint.decimals)))
      .unwrap()
      .checked_mul(InnerUint::from(1_000_000u64)) // Add 6 precision
      .unwrap(),
  }
}

pub fn to_mint_amount(amt: &PreciseNumber, mint: &Mint, ceil: bool) -> u64 {
  // Lookup is faster than a checked_pow
  let pow_10 = get_pow_10(mint.decimals);

  let pre_round = amt.checked_mul(&pow_10).unwrap();
  let post_round = if ceil {
    pre_round.ceiling().unwrap()
  } else {
    pre_round.floor().unwrap()
  };

  post_round.to_imprecise().unwrap() as u64
}
