use std::cmp::max;

use anchor_lang::{prelude::*, InstructionData};
use modular_governance::{
  organization::accounts::OrganizationV0,
  proposal::{
    accounts::{ProposalConfigV0, ProposalV0},
    types::ProposalState,
  },
  state_controller::{
    accounts::ResolutionSettingsV0, client::args::ResolveV0, types::ResolutionNode,
  },
};
use spl_token::solana_program::instruction::Instruction;
use tuktuk_program::{
  compile_transaction,
  tuktuk::{
    cpi::{accounts::QueueTaskV0, queue_task_v0},
    program::Tuktuk,
  },
  types::QueueTaskArgsV0,
  TaskQueueV0, TransactionSourceV0, TriggerV0,
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct QueueResolveProposalArgsV0 {
  pub free_task_id: u16,
}

#[derive(Accounts)]
pub struct QueueResolveProposalV0<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(constraint = namespace.name == "Helium")]
  pub namespace: Box<Account<'info, OrganizationV0>>,
  #[account(
    has_one = proposal_config,
    constraint = matches!(proposal.state, ProposalState::Voting { ..}),
    constraint = proposal.owner == modular_governance::proposal::ID
  )]
  pub proposal: Box<Account<'info, ProposalV0>>,
  #[account(
    has_one = state_controller
  )]
  pub proposal_config: Box<Account<'info, ProposalConfigV0>>,
  pub state_controller: Box<Account<'info, ResolutionSettingsV0>>,
  /// CHECK: Via seeds
  #[account(
    mut,
    seeds = [b"queue_authority"],
    bump,
  )]
  pub queue_authority: AccountInfo<'info>,
  #[account(mut)]
  pub task_queue: Box<Account<'info, TaskQueueV0>>,
  #[account(mut)]
  /// CHECK: via cpi
  pub task: AccountInfo<'info>,
  pub tuktuk_program: Program<'info, Tuktuk>,
  pub system_program: Program<'info, System>,
}

pub fn handler(
  ctx: Context<QueueResolveProposalV0>,
  args: QueueResolveProposalArgsV0,
) -> Result<()> {
  let start_ts = match ctx.accounts.proposal.state {
    ProposalState::Voting { start_ts, .. } => start_ts,
    _ => return Err(ProgramError::InvalidAccountData.into()),
  };
  let end_ts = ctx
    .accounts
    .state_controller
    .settings
    .nodes
    .iter()
    .find_map(|node| {
      if let ResolutionNode::OffsetFromStartTs { offset } = node {
        Some(start_ts + *offset)
      } else {
        None
      }
    })
    .unwrap();

  let (resolve_ix, _) = compile_transaction(
    vec![Instruction {
      program_id: *ctx.accounts.state_controller.to_account_info().owner,
      accounts: modular_governance::state_controller::client::accounts::ResolveV0 {
        state_controller: ctx.accounts.state_controller.key(),
        proposal: ctx.accounts.proposal.key(),
        proposal_config: ctx.accounts.proposal_config.key(),
        proposal_program: *ctx.accounts.proposal.to_account_info().owner,
      }
      .to_account_metas(None),
      data: ResolveV0 {}.data(),
    }],
    vec![],
  )?;

  let description = format!("resolve proposal {}", ctx.accounts.proposal.name)
    .chars()
    .take(42)
    .collect::<String>();

  queue_task_v0(
    CpiContext::new_with_signer(
      ctx.accounts.tuktuk_program.to_account_info(),
      QueueTaskV0 {
        payer: ctx.accounts.payer.to_account_info(),
        queue_authority: ctx.accounts.queue_authority.to_account_info(),
        task_queue: ctx.accounts.task_queue.to_account_info(),
        task_queue_authority: ctx.accounts.task_queue.to_account_info(),
        task: ctx.accounts.task.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
      },
      &[&["queue_authority".as_bytes(), &[ctx.bumps.queue_authority]]],
    ),
    QueueTaskArgsV0 {
      trigger: TriggerV0::Timestamp(max(Clock::get()?.unix_timestamp, end_ts)),
      transaction: TransactionSourceV0::CompiledV0(resolve_ix),
      crank_reward: None,
      free_tasks: 0,
      id: args.free_task_id,
      description,
    },
  )?;

  Ok(())
}
