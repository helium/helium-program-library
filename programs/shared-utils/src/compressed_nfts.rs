use anchor_lang::prelude::*;
use mpl_bubblegum::state::leaf_schema::LeafSchema;
use mpl_bubblegum::utils::get_asset_id;
use spl_account_compression::cpi::accounts::VerifyLeaf;
use spl_account_compression::cpi::verify_leaf;

pub struct VerifyCompressedNftArgs<'info> {
  /// CHECK: Why are you yelling at me here, anchor?
  pub merkle_tree: AccountInfo<'info>,
  /// CHECK: Why are you yelling at me here, anchor?
  pub compression_program: AccountInfo<'info>,
  pub data_hash: [u8; 32],
  pub creator_hash: [u8; 32],
  pub owner: Pubkey,
  pub delegate: Pubkey,
  pub root: [u8; 32],
  pub index: u32,
  pub proof_accounts: Vec<AccountInfo<'info>>,
}

pub fn verify_compressed_nft(args: VerifyCompressedNftArgs) -> Result<()> {
  let verify_ctx = CpiContext::new(
    args.compression_program,
    VerifyLeaf {
      merkle_tree: args.merkle_tree.clone(),
    },
  )
  .with_remaining_accounts(args.proof_accounts);

  let leaf = LeafSchema::new_v0(
    get_asset_id(args.merkle_tree.key, args.index.into()),
    args.owner,
    args.delegate,
    args.index.into(),
    args.data_hash,
    args.creator_hash,
  );

  verify_leaf(verify_ctx, args.root, leaf.to_node(), args.index)
}
