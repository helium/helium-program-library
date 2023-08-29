pub fn get_bitmap_len(max_depth: u32) -> usize {
  let num_txns = 1 << max_depth;
  // Div ceil, https://stackoverflow.com/questions/72442853/how-would-you-perform-ceiling-division
  ((num_txns + 8 - 1) / 8) as usize
}

pub fn is_executed(bitmap: &[u8], index: u32) -> bool {
  let byte = bitmap[index as usize / 8];
  let bit = 1 << (index % 8);
  byte & bit != 0
}

pub fn set_executed(bitmap: &mut [u8], index: u32) {
  let byte = &mut bitmap[index as usize / 8];
  let bit = 1 << (index % 8);
  *byte |= bit;
}
