use crate::{program_address, state::*};
use anchor_lang::prelude::*;
use mpl_bubblegum::{
  cpi::{accounts::CreateTree, create_tree},
  program::Bubblegum,
};
use shared_utils::resize_to_fit;
use spl_account_compression::{program::SplAccountCompression, Noop};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct UpdateProgramTreeArgsV0 {
  pub max_depth: u32,
  pub max_buffer_size: u32,
  pub approver_seeds: Vec<Vec<u8>>,
  // This merkle tree gets removed if supplied, the approved program has the responsibility of making sure they aren't kicking out a valid tree
  pub old_merkle_tree: Option<Pubkey>,
}

#[derive(Accounts)]
#[instruction(args: UpdateProgramTreeArgsV0)]
pub struct UpdateProgramTreeV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    address = program_address(args.approver_seeds, &program_approval.program_id)?
  )]
  pub program_approver: Signer<'info>,
  #[account(mut)]
  pub program_approval: Box<Account<'info, ProgramApprovalV0>>,
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

  pub tree_creator: Signer<'info>,

  pub log_wrapper: Program<'info, Noop>,
  pub system_program: Program<'info, System>,
  pub bubblegum_program: Program<'info, Bubblegum>,
  pub compression_program: Program<'info, SplAccountCompression>,
}

pub fn handler(ctx: Context<UpdateProgramTreeV0>, args: UpdateProgramTreeArgsV0) -> Result<()> {
  create_tree(
    CpiContext::new(
      ctx.accounts.bubblegum_program.to_account_info().clone(),
      CreateTree {
        tree_authority: ctx.accounts.new_tree_authority.to_account_info().clone(),
        merkle_tree: ctx.accounts.new_merkle_tree.to_account_info().clone(),
        payer: ctx.accounts.payer.to_account_info().clone(),
        tree_creator: ctx.accounts.tree_creator.to_account_info().clone(),
        log_wrapper: ctx.accounts.log_wrapper.to_account_info().clone(),
        compression_program: ctx.accounts.compression_program.to_account_info().clone(),
        system_program: ctx.accounts.system_program.to_account_info().clone(),
      },
    ),
    args.max_depth,
    args.max_buffer_size,
    None,
  )?;
  match args.old_merkle_tree {
    Some(old_merkle_tree) => {
      let index = ctx
        .accounts
        .program_approval
        .approved_merkle_trees
        .iter()
        .position(|&x| x == old_merkle_tree);
      match index {
        Some(idx) => {
          ctx.accounts.program_approval.approved_merkle_trees[idx] =
            ctx.accounts.new_merkle_tree.key();
        }
        None => {
          ctx
            .accounts
            .program_approval
            .approved_merkle_trees
            .push(ctx.accounts.new_merkle_tree.key());
        }
      }
    }
    None => {
      ctx
        .accounts
        .program_approval
        .approved_merkle_trees
        .push(ctx.accounts.new_merkle_tree.key());
    }
  }

  resize_to_fit(
    &ctx.accounts.payer.to_account_info(),
    &ctx.accounts.system_program.to_account_info(),
    &ctx.accounts.program_approval,
  )?;

  Ok(())
}
