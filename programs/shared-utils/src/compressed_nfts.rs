use anchor_lang::prelude::*;
use spl_account_compression::cpi::accounts::VerifyLeaf;
use spl_account_compression::cpi::verify_leaf;

pub struct VerifyCompressedNftArgs<'info> {
  /// CHECK: Why are you yelling at me here, anchor?
  pub merkle_tree: AccountInfo<'info>,
  /// CHECK: Why are you yelling at me here, anchor?
  pub compression_program: AccountInfo<'info>,
  pub hash: [u8; 32],
  pub owner: Pubkey,
  pub delegate: Pubkey,
  pub root: [u8; 32],
  pub index: u32,
  pub proof_accounts: Vec<AccountInfo<'info>>,
}

#[allow(clippy::result-large-err)]
pub fn verify_compressed_nft(args: VerifyCompressedNftArgs) -> Result<()> {
  let verify_ctx = CpiContext::new(
    args.compression_program,
    VerifyLeaf {
      merkle_tree: args.merkle_tree,
    },
  )
  .with_remaining_accounts(args.proof_accounts);

  verify_leaf(verify_ctx, args.root, args.hash, args.index)
}
