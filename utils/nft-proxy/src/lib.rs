use anchor_lang::prelude::*;

anchor_gen::generate_cpi_crate!("./idl.json");

declare_id!("nprx42sXf5rpVnwBWEdRg1d8tuCWsTuVLys1pRWwE6p");

impl ProxyConfigV0 {
  // Binary search for the timestamp closest to but after `unix_time`
  pub fn get_current_season(&self, unix_time: i64) -> Option<SeasonV0> {
    if self.seasons.is_empty() {
      return None;
    }

    let mut ans: Option<SeasonV0> = None;
    let mut low: usize = 0;
    let mut high: usize = self.seasons.len() - 1;

    while low <= high {
      let middle = (high + low) / 2;
      if let Some(current) = self.seasons.get(middle) {
        // Move to the right side if target time is greater
        if current.start <= unix_time {
          ans = Some(*current);
          low = middle + 1;
        } else {
          if middle == 0 {
            break;
          }
          high = middle - 1;
        }
      } else {
        break;
      }
    }

    ans
  }
}
