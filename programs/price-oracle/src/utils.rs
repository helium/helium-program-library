use crate::state::*;

const SECONDS_PER_DAY: i64 = 24 * 60 * 60;
#[allow(clippy::manual_is_multiple_of)]
pub fn calculate_current_price(oracles: &[OracleV0], curr_ts: i64) -> Option<u64> {
  let mut prices: Vec<u64> = oracles
    .iter()
    .filter(|oracle| {
      oracle.last_submitted_price.is_some()
        && oracle.last_submitted_timestamp.is_some()
        && curr_ts - oracle.last_submitted_timestamp.unwrap() <= SECONDS_PER_DAY
    })
    .filter_map(|oracle| oracle.last_submitted_price)
    .collect();

  if prices.len() < oracles.len() / 2 + 1 {
    return None;
  }

  prices.sort();
  let n = prices.len();
  let median = if n % 2 == 0 {
    ((prices[n / 2 - 1] + prices[n / 2]) as f64 / 2.0).round() as u64
  } else {
    prices[n / 2]
  };

  Some(median)
}
