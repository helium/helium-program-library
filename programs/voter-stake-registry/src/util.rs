use std::cell::Ref;

use crate::{error::VsrError, state::PositionV0};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, TokenAccount};

use crate::state::Registrar;

pub fn resolve_vote_weight(
  registrar: Ref<Registrar>,
  governing_token_owner: &Pubkey,
  token_account: &AccountInfo,
  position: &AccountInfo,
  unique_nft_mints: &mut Vec<Pubkey>,
) -> Result<u64> {
  let token_account_acc = TokenAccount::try_deserialize(&mut token_account.data.borrow().as_ref())?;
  require_eq!(*token_account.owner, token::ID, VsrError::InvalidProgramId);

  let position_acc = PositionV0::try_deserialize(&mut position.data.borrow().as_ref())?;
  require_eq!(*position.owner, crate::ID, VsrError::InvalidProgramId);

  require_eq!(
    token_account_acc.owner,
    *governing_token_owner,
    VsrError::InvalidMintOwner
  );
  require_eq!(token_account_acc.amount, 1, VsrError::InvalidMintAmount);

  require!(
    !unique_nft_mints.contains(&token_account.key()),
    VsrError::DuplicatedNftDetected
  );

  let voting_mint_config = registrar.voting_mints[usize::from(position_acc.voting_mint_config_idx)];

  position_acc.voting_power(&voting_mint_config, registrar.clock_unix_timestamp())
}
