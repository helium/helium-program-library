use crate::state::*;
use account_compression_cpi::{program::SplAccountCompression, Noop};
use anchor_lang::prelude::*;
use bubblegum_cpi::{
  cpi::{accounts::CreateTree, create_tree},
  program::Bubblegum,
  TreeConfig,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateMakerTreeArgsV0 {
  pub max_depth: u32,
  pub max_buffer_size: u32,
}

#[derive(Accounts)]
#[instruction(args: UpdateMakerTreeArgsV0)]
pub struct UpdateMakerTreeV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(mut)]
  pub maker: Box<Account<'info, MakerV0>>,
  #[account(
    mut,
    seeds = [maker.merkle_tree.key().as_ref()],
    bump,
    // Allow permissionlessly swapping trees when we're within 3 of full
    constraint = tree_authority.num_minted > (tree_authority.total_mint_capacity - 3),
    seeds::program = bubblegum_program.key()
  )]
  pub tree_authority: Box<Account<'info, TreeConfig>>,
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

pub fn handler(ctx: Context<UpdateMakerTreeV0>, args: UpdateMakerTreeArgsV0) -> Result<()> {
  let signer_seeds: &[&[&[u8]]] = &[&[
    b"maker",
    ctx.accounts.maker.dao.as_ref(),
    ctx.accounts.maker.name.as_bytes(),
    &[ctx.accounts.maker.bump_seed],
  ]];

  create_tree(
    CpiContext::new_with_signer(
      ctx.accounts.bubblegum_program.to_account_info().clone(),
      CreateTree {
        tree_authority: ctx.accounts.new_tree_authority.to_account_info().clone(),
        merkle_tree: ctx.accounts.new_merkle_tree.to_account_info().clone(),
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
  ctx.accounts.maker.merkle_tree = ctx.accounts.new_merkle_tree.key();

  Ok(())
}
