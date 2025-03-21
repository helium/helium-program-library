use anchor_lang::prelude::*;
use tuktuk_program::{RunTaskReturnV0, TaskReturnV0, TransactionSourceV0, TriggerV0};
use voter_stake_registry::state::ProxyMarkerV0;

use super::{VOTE_SERVICE_SIGNER, VOTE_SERVICE_URL};

#[derive(Accounts)]
pub struct RequeueProxyVoteV0<'info> {
  pub marker: Box<Account<'info, ProxyMarkerV0>>,
}

pub fn handler(ctx: Context<RequeueProxyVoteV0>) -> Result<RunTaskReturnV0> {
  let description = "proxy vote".to_string();
  Ok(RunTaskReturnV0 {
    tasks: vec![TaskReturnV0 {
      trigger: TriggerV0::Now,
      transaction: TransactionSourceV0::RemoteV0 {
        url: format!(
          "{}/v1/proposals/{}/proxy-vote/{}",
          VOTE_SERVICE_URL, ctx.accounts.marker.proposal, ctx.accounts.marker.voter
        ),
        signer: VOTE_SERVICE_SIGNER,
      },
      crank_reward: None,
      free_tasks: 1,
      description,
    }],
    accounts: vec![],
  })
}
