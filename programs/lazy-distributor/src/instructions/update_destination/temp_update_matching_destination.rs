use anchor_lang::prelude::*;
use solana_program::pubkey;

use crate::state::*;

const LD_IOT: Pubkey = pubkey!("37eiz5KzYwpAdLgrSh8GT1isKiJ6hcE5ET86dqaoCugL");
const LD_MOBILE: Pubkey = pubkey!("GZtTp3AUo2AHdQe9BCJ6gXR9KqfruRvHnZ4QiJUALMcz");
const LD_HNT: Pubkey = pubkey!("6gcZXjHgKUBMedc2V1aZLFPwh8M1rPVRw7kpo2KqNrFq");
const HPROD: Pubkey = pubkey!("hprdnjkbziK8NqhThmAn5Gu4XqrBbctX8du4PfJdgvW");

#[derive(Accounts)]
pub struct TempUpdateMatchingDestination<'info> {
  #[account(
    address = HPROD
  )]
  pub authority: Signer<'info>,
  #[account(
    constraint = original_recipient.lazy_distributor == LD_IOT || original_recipient.lazy_distributor == LD_MOBILE,
  )]
  pub original_recipient: Box<Account<'info, RecipientV0>>,

  #[account(
    mut,
    constraint = recipient.lazy_distributor == LD_HNT
  )]
  pub recipient: Box<Account<'info, RecipientV0>>,
}

pub fn handler(ctx: Context<TempUpdateMatchingDestination>) -> Result<()> {
  ctx.accounts.recipient.destination = ctx.accounts.original_recipient.destination;

  Ok(())
}
