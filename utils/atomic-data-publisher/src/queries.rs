use std::collections::HashMap;
use std::sync::OnceLock;

/// Module for managing SQL queries used in the atomic data publisher service.
///
/// This module provides a centralized location for all SQL queries used to extract
/// and transform data for atomic publishing. The queries are designed to work with
/// PostgreSQL and use parameterized queries for security and performance.
pub struct AtomicHotspotQueries;

impl AtomicHotspotQueries {
  pub fn get_all_queries() -> &'static HashMap<&'static str, &'static str> {
    static QUERIES: OnceLock<HashMap<&'static str, &'static str>> = OnceLock::new();
    QUERIES.get_or_init(|| {
      let mut queries = HashMap::new();
      queries.insert(
        "construct_atomic_hotspots",
        include_str!("sql/construct_atomic_hotspots.sql"),
      );
      queries.insert(
        "construct_entity_ownership_changes",
        include_str!("sql/construct_entity_ownership_changes.sql"),
      );
      queries.insert(
        "construct_entity_reward_destination_changes",
        include_str!("sql/construct_entity_reward_destination_changes.sql"),
      );
      queries
    })
  }

  pub fn get_query(query_name: &str) -> Option<&'static str> {
    Self::get_all_queries().get(query_name).copied()
  }

  pub fn validate_query_name(query_name: &str) -> Result<(), String> {
    let valid_queries = Self::get_all_queries();
    if valid_queries.contains_key(query_name) {
      Ok(())
    } else {
      Err(format!(
        "Invalid query name: '{}'. Valid queries are: {:?}",
        query_name,
        valid_queries.keys().collect::<Vec<_>>()
      ))
    }
  }
}
