use crate::error::ErrorCode;
use crate::{data_only_config_seeds, state::*};
use account_compression_cpi::{program::SplAccountCompression, Noop};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::system_instruction::{self};
use bubblegum_cpi::TreeConfig;
use bubblegum_cpi::{
  cpi::{accounts::CreateTree, create_tree},
  program::Bubblegum,
};

#[derive(Accounts)]
pub struct UpdateDataOnlyTreeV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(mut)]
  pub data_only_config: Box<Account<'info, DataOnlyConfigV0>>,
  #[account(
    mut,
    seeds = [data_only_config.merkle_tree.as_ref()],
    bump,
    seeds::program = bubblegum_program.key(),
  )]
  pub old_tree_authority: Account<'info, TreeConfig>,

  /// CHECK: Checked by cpi
  #[account(
    mut,
    seeds = [new_merkle_tree.key().as_ref()],
    bump,
    seeds::program = bubblegum_program.key()
  )]
  pub new_tree_authority: AccountInfo<'info>,

  /// CHECK: checked with seeds
  #[account(mut,
    seeds = [
      "data_only_escrow".as_bytes(),
      data_only_config.key().as_ref(),
    ],
    bump
  )]
  pub data_only_escrow: AccountInfo<'info>,

  /// CHECK: Checked by cpi
  #[account(mut)]
  pub new_merkle_tree: UncheckedAccount<'info>,

  pub log_wrapper: Program<'info, Noop>,
  pub system_program: Program<'info, System>,
  pub bubblegum_program: Program<'info, Bubblegum>,
  pub compression_program: Program<'info, SplAccountCompression>,
}

pub fn handler(ctx: Context<UpdateDataOnlyTreeV0>) -> Result<()> {
  require!(
    ctx.accounts.new_merkle_tree.to_account_info().data_len()
      == ctx.accounts.data_only_config.new_tree_space as usize,
    ErrorCode::InvalidTreeSpace
  );

  if !ctx
    .accounts
    .old_tree_authority
    .to_account_info()
    .data_is_empty()
  {
    require_gt!(
      ctx.accounts.old_tree_authority.num_minted,
      ctx.accounts.old_tree_authority.total_mint_capacity - 5,
      ErrorCode::TreeNotFull
    );
  }

  let data_only_seeds: &[&[&[u8]]] = &[data_only_config_seeds!(ctx.accounts.data_only_config)];
  create_tree(
    CpiContext::new_with_signer(
      ctx.accounts.bubblegum_program.to_account_info().clone(),
      CreateTree {
        tree_authority: ctx.accounts.new_tree_authority.to_account_info().clone(),
        merkle_tree: ctx.accounts.new_merkle_tree.to_account_info().clone(),
        payer: ctx.accounts.payer.to_account_info().clone(),
        tree_creator: ctx.accounts.data_only_config.to_account_info().clone(),
        log_wrapper: ctx.accounts.log_wrapper.to_account_info().clone(),
        compression_program: ctx.accounts.compression_program.to_account_info().clone(),
        system_program: ctx.accounts.system_program.to_account_info().clone(),
      },
      data_only_seeds,
    ),
    ctx.accounts.data_only_config.new_tree_depth,
    ctx.accounts.data_only_config.new_tree_buffer_size,
    None,
  )?;
  ctx.accounts.data_only_config.merkle_tree = ctx.accounts.new_merkle_tree.key();

  // reimburse the payer from the escrow account
  let cost = Rent::get()?.minimum_balance(ctx.accounts.data_only_config.new_tree_space as usize);
  invoke_signed(
    &system_instruction::transfer(
      &ctx.accounts.data_only_escrow.key(),
      &ctx.accounts.payer.key(),
      cost,
    ),
    &[
      ctx.accounts.data_only_escrow.to_account_info().clone(),
      ctx.accounts.payer.to_account_info().clone(),
      ctx.accounts.system_program.to_account_info().clone(),
    ],
    &[&[
      b"data_only_escrow",
      ctx.accounts.data_only_config.key().as_ref(),
      &[ctx.bumps["data_only_escrow"]],
    ]],
  )?;
  Ok(())
}
