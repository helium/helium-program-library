use crate::state::Curve;
use shared_utils::precise_number::{InnerUint, PreciseNumber, ONE_PREC, ZERO_PREC};
use std::convert::*;

pub trait PricingCurve {
  fn price(
    &self,
    treasury_amount: &PreciseNumber,
    target_supply: &PreciseNumber,
    amount: &PreciseNumber,
    sell: bool,
  ) -> Option<PreciseNumber>;
}

fn price_exp_initial(
  c_prec: &PreciseNumber,
  k_prec: &PreciseNumber,
  amount: &PreciseNumber,
) -> Option<PreciseNumber> {
  // (c dS^(1 + pow/frac))/(1 + pow/frac)
  let one_plus_k_prec = &ONE_PREC.checked_add(k_prec)?;
  c_prec
    .checked_mul(&amount.pow(one_plus_k_prec)?)?
    .checked_div(one_plus_k_prec)
}

fn price_exp(
  k_prec: &PreciseNumber,
  amount: &PreciseNumber,
  treasury_amount: &PreciseNumber,
  target_supply: &PreciseNumber,
  sell: bool,
) -> Option<PreciseNumber> {
  /*
    dR = (R / S^(1 + k)) ((S + dS)^(1 + k) - S^(1 + k))
    dR = (R(S + dS)^(1 + k))/S^(1 + k) - R
    log(dR + R) = log((R(S + dS)^(1 + k))/S^(1 + k))
    log(dR + R) = log((R(S + dS)^(1 + k))) - log(S^(1 + k))
    log(dR + R) = log(R) + (1 + k) log((S + dS)) - (1 + k)log(S)
    log(dR + R) = (1 + k) (log(R(S + dS)) - log(S))
    dR + R = e^(log(R) + (1 + k) (log((S + dS)) - log(S)))
    dR = e^(log(R) + (1 + k) (log((S + dS)) - log(S))) - R
    dR = e^(log(R) + (1 + k) (log((S + dS) / S))) - R

    Edge case: selling where dS = S. Just charge them the full treasury amount
  */
  let s_plus_ds = if sell {
    target_supply.checked_sub(amount)?
  } else {
    target_supply.checked_add(amount)?
  };
  let one_plus_k_prec = &ONE_PREC.checked_add(k_prec)?;

  // They're killing the curve, so it should cost the full treasurys
  if s_plus_ds.eq(&ZERO_PREC) {
    return Some(treasury_amount.clone());
  }

  let log1 = treasury_amount.log()?;
  let log2 = s_plus_ds.checked_div(target_supply)?.log()?;
  let logs = log1.checked_add(&one_plus_k_prec.clone().signed().checked_mul(&log2)?)?;
  let exp = logs.exp()?;

  Some(
    exp
      .signed()
      .checked_sub(&treasury_amount.clone().signed())?
      .value,
  )
}

fn to_prec(i: u128) -> PreciseNumber {
  PreciseNumber {
    value: InnerUint::from(i) * 1_000_000_u64, // Add 6 precision
  }
}

impl PricingCurve for Curve {
  fn price(
    &self,
    treasury_amount: &PreciseNumber,
    target_supply: &PreciseNumber,
    amount: &PreciseNumber,
    sell: bool,
  ) -> Option<PreciseNumber> {
    if treasury_amount.eq(&ZERO_PREC) || target_supply.eq(&ZERO_PREC) {
      match *self {
        // (c dS^(1 + k))/(1 + k)
        Curve::ExponentialCurveV0 { k, c } => {
          let c_prec = to_prec(c);
          let k_prec = to_prec(k);
          price_exp_initial(&c_prec, &k_prec, amount)
        }
      }
    } else {
      match *self {
        Curve::ExponentialCurveV0 { k, c } => {
          if c != 0 {
            let k_prec = to_prec(k);
            price_exp(&k_prec, amount, treasury_amount, target_supply, sell)
          } else {
            // R dS / S
            treasury_amount
              .checked_mul(amount)?
              .checked_div(target_supply)
          }
        }
      }
    }
  }
}
