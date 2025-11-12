use account_compression_cpi::{account_compression::program::SplAccountCompression, Noop};
use anchor_lang::prelude::*;
use bubblegum_cpi::bubblegum::{
  accounts::TreeConfig,
  cpi::{accounts::CreateTree, create_tree},
  program::Bubblegum,
};
use shared_utils::try_from;

use crate::{carrier_seeds, error::ErrorCode, state::*};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateCarrierTreeArgsV0 {
  pub max_depth: u32,
  pub max_buffer_size: u32,
}

#[derive(Accounts)]
#[instruction(args: UpdateCarrierTreeArgsV0)]
pub struct UpdateCarrierTreeV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(mut)]
  pub carrier: Box<Account<'info, CarrierV0>>,
  /// CHECK: Conditionally decoded
  #[account(
    mut,
    seeds = [carrier.merkle_tree.as_ref()],
    bump,
    seeds::program = bubblegum_program.key(),
  )]
  pub tree_config: UncheckedAccount<'info>,
  #[account(
    mut,
    seeds = [new_merkle_tree.key().as_ref()],
    bump,
    seeds::program = bubblegum_program.key()
  )]
  /// CHECK: Checked by cpi
  pub new_tree_authority: UncheckedAccount<'info>,
  #[account(mut)]
  /// CHECK: Checked by cpi
  pub new_merkle_tree: AccountInfo<'info>,

  pub log_wrapper: Program<'info, Noop>,
  pub system_program: Program<'info, System>,
  pub bubblegum_program: Program<'info, Bubblegum>,
  pub compression_program: Program<'info, SplAccountCompression>,
}

pub fn handler(ctx: Context<UpdateCarrierTreeV0>, args: UpdateCarrierTreeArgsV0) -> Result<()> {
  let signer_seeds: &[&[&[u8]]] = &[carrier_seeds!(ctx.accounts.carrier)];

  // Only permissionlessly swapping trees when we're within 3 of full
  if !ctx.accounts.tree_config.data_is_empty() {
    let tree_config: Account<TreeConfig> =
      try_from!(Account<TreeConfig>, &ctx.accounts.tree_config)?;
    require_gt!(
      tree_config.num_minted,
      tree_config.total_mint_capacity - 3,
      ErrorCode::TreeNotFull
    );
  }

  create_tree(
    CpiContext::new_with_signer(
      ctx.accounts.bubblegum_program.to_account_info().clone(),
      CreateTree {
        tree_authority: ctx.accounts.new_tree_authority.to_account_info().clone(),
        merkle_tree: ctx.accounts.new_merkle_tree.to_account_info().clone(),
        payer: ctx.accounts.payer.to_account_info().clone(),
        tree_creator: ctx.accounts.carrier.to_account_info().clone(),
        log_wrapper: ctx.accounts.log_wrapper.to_account_info().clone(),
        compression_program: ctx.accounts.compression_program.to_account_info().clone(),
        system_program: ctx.accounts.system_program.to_account_info().clone(),
      },
      signer_seeds,
    ),
    args.max_depth,
    args.max_buffer_size,
    None,
  )?;
  ctx.accounts.carrier.merkle_tree = ctx.accounts.new_merkle_tree.key();

  Ok(())
}
