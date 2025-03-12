use anchor_lang::prelude::*;
use tuktuk_program::{RunTaskReturnV0, TaskReturnV0, TransactionSourceV0, TriggerV0};

use super::{NUM_QUEUED_PER_BATCH, ORACLE_SIGNER, ORACLE_URL};

#[derive(Accounts)]
pub struct RequeueWalletClaimV0<'info> {
  /// CHECK: No check
  pub wallet: AccountInfo<'info>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct RequeueWalletClaimArgsV0 {
  pub batch_number: u16,
}

pub fn handler(
  ctx: Context<RequeueWalletClaimV0>,
  args: RequeueWalletClaimArgsV0,
) -> Result<RunTaskReturnV0> {
  let description = "ld wallet claim".to_string();
  Ok(RunTaskReturnV0 {
    tasks: vec![TaskReturnV0 {
      trigger: TriggerV0::Now,
      transaction: TransactionSourceV0::RemoteV0 {
        url: format!(
          "{}/v1/tuktuk/wallet/{}?batchNumber={}",
          ORACLE_URL,
          ctx.accounts.wallet.key(),
          args.batch_number
        ),
        signer: ORACLE_SIGNER,
      },
      crank_reward: None,
      free_tasks: NUM_QUEUED_PER_BATCH + 1,
      description,
    }],
    accounts: vec![],
  })
}
