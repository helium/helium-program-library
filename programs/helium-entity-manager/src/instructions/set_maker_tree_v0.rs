use crate::state::*;
use anchor_lang::prelude::*;
use mpl_bubblegum::{
  cpi::{accounts::CreateTree, create_tree},
  program::Bubblegum,
};
use spl_account_compression::{program::SplAccountCompression, Noop};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct SetMakerTreeArgsV0 {
  pub max_depth: u32,
  pub max_buffer_size: u32,
}

#[derive(Accounts)]
#[instruction(args: SetMakerTreeArgsV0)]
pub struct SetMakerTreeV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  pub update_authority: Signer<'info>,
  #[account(
    mut,
    has_one = update_authority,
  )]
  pub maker: Box<Account<'info, MakerV0>>,
  #[account(
    mut,
    seeds = [merkle_tree.key().as_ref()],
    bump,
    seeds::program = bubblegum_program.key()
  )]
  /// CHECK: Checked by cpi
  pub tree_authority: AccountInfo<'info>,

  /// CHECK: Checked by cpi
  #[account(mut)]
  pub merkle_tree: UncheckedAccount<'info>,

  pub log_wrapper: Program<'info, Noop>,
  pub system_program: Program<'info, System>,
  pub bubblegum_program: Program<'info, Bubblegum>,
  pub compression_program: Program<'info, SplAccountCompression>,
}

pub fn handler(ctx: Context<SetMakerTreeV0>, args: SetMakerTreeArgsV0) -> Result<()> {
  let signer_seeds: &[&[&[u8]]] = &[&[
    b"maker",
    ctx.accounts.maker.name.as_bytes(),
    &[ctx.accounts.maker.bump_seed],
  ]];

  create_tree(
    CpiContext::new_with_signer(
      ctx.accounts.bubblegum_program.to_account_info().clone(),
      CreateTree {
        tree_authority: ctx.accounts.tree_authority.to_account_info().clone(),
        merkle_tree: ctx.accounts.merkle_tree.to_account_info().clone(),
        payer: ctx.accounts.payer.to_account_info().clone(),
        tree_creator: ctx.accounts.maker.to_account_info().clone(),
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
  ctx.accounts.maker.merkle_tree = ctx.accounts.merkle_tree.key();

  Ok(())
}
