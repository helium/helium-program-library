use anchor_lang::prelude::*;
use tuktuk_program::{RunTaskReturnV0, TaskReturnV0, TransactionSourceV0, TriggerV0};

use super::{ORACLE_SIGNER, ORACLE_URL};
use crate::voter_stake_registry::accounts::ProxyMarkerV0;

#[derive(Accounts)]
pub struct RequeueWalletClaimV0<'info> {
  /// CHECK: No check
  pub wallet: AccountInfo<'info>,
}

pub fn handler(ctx: Context<RequeueWalletClaimV0>) -> Result<RunTaskReturnV0> {
  let description = "ld rewards claim".to_string();
  Ok(RunTaskReturnV0 {
    tasks: vec![TaskReturnV0 {
      trigger: TriggerV0::Now,
      transaction: TransactionSourceV0::RemoteV0 {
        url: format!(
          "{}/v1/tuktuk/wallet/{}",
          ORACLE_URL,
          ctx.accounts.wallet.key()
        ),
        signer: ORACLE_SIGNER,
      },
      crank_reward: None,
      free_tasks: 1,
      description,
    }],
    accounts: vec![],
  })
}
