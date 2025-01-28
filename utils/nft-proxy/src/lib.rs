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
        if current.start <= unix_time && current.end > unix_time {
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

impl PartialEq for SeasonV0 {
  fn eq(&self, other: &Self) -> bool {
    self.start == other.start && self.end == other.end
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_get_current_season() {
    let config = ProxyConfigV0 {
      seasons: vec![
        SeasonV0 {
          start: 100,
          end: 200,
        },
        SeasonV0 {
          start: 150,
          end: 400,
        },
        SeasonV0 {
          start: 350,
          end: 600,
        },
      ],
      ..Default::default()
    };

    // Test normal cases
    assert_eq!(
      config.get_current_season(150),
      Some(SeasonV0 {
        start: 150,
        end: 400,
      }),
      "Should find season containing timestamp"
    );

    // Test edge cases
    assert_eq!(
      config.get_current_season(100),
      Some(SeasonV0 {
        start: 100,
        end: 200,
      }),
      "Should work on season start"
    );
    assert_eq!(
      config.get_current_season(200),
      Some(SeasonV0 {
        start: 150,
        end: 400,
      }),
      "Should work on season end"
    );

    // Test gaps between seasons
    assert_eq!(
      config.get_current_season(250),
      Some(SeasonV0 {
        start: 150,
        end: 400,
      }),
      "Bug: Returns ended season for timestamp in gap"
    );

    // Test before first season
    assert_eq!(
      config.get_current_season(50),
      None,
      "Should return None before first season"
    );

    // Test after last season
    assert_eq!(
      config.get_current_season(700),
      None,
      "Bug: Returns ended season for timestamp after all seasons"
    );

    // Test empty seasons
    let empty_config = ProxyConfigV0 {
      seasons: vec![],
      ..Default::default()
    };
    assert_eq!(
      empty_config.get_current_season(100),
      None,
      "Should handle empty seasons"
    );
  }
}
