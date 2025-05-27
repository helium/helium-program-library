use std::{cmp::max, vec};

use anchor_lang::{prelude::*, system_program, InstructionData};
use spl_token::solana_program::instruction::Instruction;
use tuktuk_program::{
  compile_transaction, RunTaskReturnV0, TaskReturnV0, TransactionSourceV0, TriggerV0,
};
use voter_stake_registry::state::{PositionV0, VoteMarkerV0};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct RequeueRelinquishExpiredVoteMarkerArgsV0 {
  pub trigger_ts: i64,
}

#[derive(Accounts)]
pub struct RequeueRelinquishExpiredVoteMarkerV0<'info> {
  pub marker: Box<Account<'info, VoteMarkerV0>>,
  #[account(
    constraint = position.mint == marker.mint
  )]
  pub position: Box<Account<'info, PositionV0>>,
}

pub fn handler(
  ctx: Context<RequeueRelinquishExpiredVoteMarkerV0>,
  args: RequeueRelinquishExpiredVoteMarkerArgsV0,
) -> Result<RunTaskReturnV0> {
  let (compiled_tx, _) = compile_transaction(
    vec![Instruction {
      program_id: voter_stake_registry::ID,
      accounts: voter_stake_registry::accounts::RelinquishExpiredVoteV0 {
        marker: ctx.accounts.marker.key(),
        position: ctx.accounts.position.key(),
        proposal: ctx.accounts.marker.proposal.key(),
        system_program: system_program::ID,
        rent_refund: ctx.accounts.marker.rent_refund.key(),
      }
      .to_account_metas(None)
      .to_vec(),
      data: voter_stake_registry::instruction::RelinquishExpiredVoteV0 {}.data(),
    }],
    vec![],
  )
  .unwrap();

  Ok(RunTaskReturnV0 {
    tasks: vec![TaskReturnV0 {
      trigger: TriggerV0::Timestamp(max(Clock::get()?.unix_timestamp, args.trigger_ts)),
      transaction: TransactionSourceV0::CompiledV0(compiled_tx),
      crank_reward: None,
      free_tasks: 0,
      description: "relinquish expired vote marker".to_string(),
    }],
    accounts: vec![],
  })
}
