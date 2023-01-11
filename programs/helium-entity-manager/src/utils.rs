pub fn hotspot_key(uri: &str) -> &str {
  // Expect something like https://metadata.oracle.test-helium.com/:eccCompact
  // So just take the id after the last slash
  uri.split('/').last().unwrap()
}
