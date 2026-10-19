//! Reads a spl-account-compression merkle tree account to size the proof `verify_leaf` needs.

use anchor_lang::prelude::*;

use crate::error::ErrorCode;

/// `CONCURRENT_MERKLE_TREE_HEADER_SIZE_V1` in spl-account-compression: account type, header
/// version, then the V1 header (max_buffer_size, max_depth, authority, creation_slot, padding).
const TREE_HEADER_LEN: usize = 56;
const NODE_LEN: usize = 32;

/// Bytes of a `ConcurrentMerkleTree<max_depth, max_buffer_size>`: sequence number, active index
/// and buffer size, then `max_buffer_size` change logs and the rightmost proof, each holding a
/// root or leaf, `max_depth` nodes, an index and padding.
fn tree_len(max_depth: usize, max_buffer_size: usize) -> Option<usize> {
  let path_len = NODE_LEN.checked_mul(max_depth)?.checked_add(NODE_LEN + 8)?;
  path_len
    .checked_mul(max_buffer_size.checked_add(1)?)?
    .checked_add(24)
}

/// Number of proof nodes `verify_leaf` needs for `merkle_tree`: its max depth minus the depth of
/// the canopy stored after the tree.
fn proof_len(merkle_tree: &AccountInfo) -> Result<usize> {
  let data = merkle_tree.try_borrow_data()?;
  let read_u32 = |offset: usize| -> Option<usize> {
    Some(u32::from_le_bytes(data.get(offset..offset + 4)?.try_into().ok()?) as usize)
  };
  let (max_buffer_size, max_depth) = read_u32(2)
    .zip(read_u32(6))
    .ok_or_else(|| error!(ErrorCode::InvalidMerkleTree))?;
  let canopy_nodes = tree_len(max_depth, max_buffer_size)
    .and_then(|len| len.checked_add(TREE_HEADER_LEN))
    .and_then(|len| data.len().checked_sub(len))
    .ok_or_else(|| error!(ErrorCode::InvalidMerkleTree))?
    / NODE_LEN;
  // The canopy is a full binary tree without its root: 2^(depth + 1) - 2 nodes.
  let canopy_depth = (canopy_nodes + 2).ilog2() as usize - 1;
  Ok(max_depth.saturating_sub(canopy_depth))
}

/// The proof nodes `verify_leaf` needs: the first `proof_len` remaining accounts.
pub(crate) fn proof_accounts<'info>(
  merkle_tree: &AccountInfo<'info>,
  remaining_accounts: &[AccountInfo<'info>],
) -> Result<Vec<AccountInfo<'info>>> {
  Ok(
    remaining_accounts
      .iter()
      .take(proof_len(merkle_tree)?)
      .cloned()
      .collect(),
  )
}

#[cfg(test)]
mod tests {
  use spl_concurrent_merkle_tree::concurrent_merkle_tree::ConcurrentMerkleTree;

  use super::*;

  fn tree_account_data(max_depth: u32, max_buffer_size: u32, canopy_depth: u32) -> Vec<u8> {
    let mut data = vec![1u8, 0u8];
    data.extend(max_buffer_size.to_le_bytes());
    data.extend(max_depth.to_le_bytes());
    data.resize(
      TREE_HEADER_LEN
        + tree_len(max_depth as usize, max_buffer_size as usize).expect("tree size fits usize")
        + ((1usize << (canopy_depth + 1)) - 2) * NODE_LEN,
      0,
    );
    data
  }

  fn proof_len_of(mut data: Vec<u8>) -> Result<usize> {
    let key = Pubkey::new_unique();
    let owner = Pubkey::new_unique();
    let mut lamports = 0u64;
    let account = AccountInfo::new(
      &key,
      false,
      false,
      &mut lamports,
      &mut data,
      &owner,
      false,
      0,
    );
    proof_len(&account)
  }

  #[test]
  fn tree_len_matches_the_concurrent_merkle_tree_layout() {
    assert_eq!(
      tree_len(3, 8),
      Some(std::mem::size_of::<ConcurrentMerkleTree<3, 8>>())
    );
    assert_eq!(
      tree_len(14, 64),
      Some(std::mem::size_of::<ConcurrentMerkleTree<14, 64>>())
    );
    assert_eq!(
      tree_len(20, 1024),
      Some(std::mem::size_of::<ConcurrentMerkleTree<20, 1024>>())
    );
  }

  #[test]
  fn proof_len_is_depth_minus_canopy_depth() {
    assert_eq!(
      proof_len_of(tree_account_data(3, 8, 0)).expect("valid tree account"),
      3
    );
    assert_eq!(
      proof_len_of(tree_account_data(14, 64, 0)).expect("valid tree account"),
      14
    );
    assert_eq!(
      proof_len_of(tree_account_data(14, 64, 11)).expect("valid tree account"),
      3
    );
    assert_eq!(
      proof_len_of(tree_account_data(20, 1024, 14)).expect("valid tree account"),
      6
    );
  }

  #[test]
  fn rejects_an_account_too_small_for_its_header() {
    let mut data = tree_account_data(14, 64, 0);
    data.truncate(data.len() - 1);
    assert!(proof_len_of(data).is_err());
    assert!(proof_len_of(vec![1u8, 0u8, 0u8]).is_err());
  }
}
