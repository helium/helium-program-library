use crate::error::ErrorCode;
use crate::{carrier_seeds, state::*};
use anchor_lang::prelude::*;
use helium_entity_manager::{
  cpi::accounts::UpdateProgramTreeV0, cpi::update_program_tree_v0, program::HeliumEntityManager,
  ProgramApprovalV0, UpdateProgramTreeArgsV0,
};
use helium_sub_daos::DaoV0;
use mpl_bubblegum::{program::Bubblegum, state::TreeConfig};
use spl_account_compression::{program::SplAccountCompression, Noop};

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
  #[account(
    mut,
    constraint = program_approval.program_id == crate::id(),
    has_one = dao,
  )]
  pub program_approval: Box<Account<'info, ProgramApprovalV0>>,
  pub dao: Box<Account<'info, DaoV0>>,
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
  pub helium_entity_manager_program: Program<'info, HeliumEntityManager>,
}

pub fn handler(ctx: Context<UpdateCarrierTreeV0>, args: UpdateCarrierTreeArgsV0) -> Result<()> {
  let signer_seeds: &[&[&[u8]]] = &[carrier_seeds!(ctx.accounts.carrier)];

  // Only permissionlessly swapping trees when we're within 3 of full
  if !ctx.accounts.tree_config.data_is_empty() {
    let tree_config: Account<TreeConfig> = Account::try_from(&ctx.accounts.tree_config)?;
    require_gt!(
      tree_config.num_minted,
      tree_config.total_mint_capacity - 3,
      ErrorCode::TreeNotFull
    );
  }

  let old_merkle_tree = if ctx.accounts.carrier.merkle_tree == Pubkey::default() {
    None
  } else {
    Some(ctx.accounts.carrier.merkle_tree)
  };

  let seeds: &[&[&[u8]]] = &[carrier_seeds!(ctx.accounts.carrier)];

  update_program_tree_v0(
    CpiContext::new_with_signer(
      ctx.accounts.bubblegum_program.to_account_info().clone(),
      UpdateProgramTreeV0 {
        payer: ctx.accounts.payer.to_account_info().clone(),
        program_approver: ctx.accounts.carrier.to_account_info().clone(),
        program_approval: ctx.accounts.program_approval.to_account_info().clone(),
        new_tree_authority: ctx.accounts.new_tree_authority.to_account_info().clone(),
        new_merkle_tree: ctx.accounts.new_merkle_tree.to_account_info().clone(),
        tree_creator: ctx.accounts.carrier.to_account_info().clone(),
        log_wrapper: ctx.accounts.log_wrapper.to_account_info().clone(),
        bubblegum_program: ctx.accounts.bubblegum_program.to_account_info().clone(),
        compression_program: ctx.accounts.compression_program.to_account_info().clone(),
        system_program: ctx.accounts.system_program.to_account_info().clone(),
      },
      signer_seeds,
    ),
    UpdateProgramTreeArgsV0 {
      max_depth: args.max_depth,
      max_buffer_size: args.max_buffer_size,
      old_merkle_tree,
      approver_seeds: seeds[0].iter().map(|s| s.to_vec()).collect(),
    },
  )?;

  ctx.accounts.carrier.merkle_tree = ctx.accounts.new_merkle_tree.key();

  Ok(())
}
