use crate::utils::*;
use solana_program::pubkey::*;
use solana_sdk::signature::Keypair;

pub struct MintCookie {
    pub index: usize,
    pub decimals: u8,
    pub unit: f64,
    pub base_lot: f64,
    pub quote_lot: f64,
    pub pubkey: Option<Pubkey>,
    pub authority: Keypair,
}

impl Clone for MintCookie {
    fn clone(&self) -> Self {
        Self {
            index: self.index,
            decimals: self.decimals,
            unit: self.unit,
            base_lot: self.base_lot,
            quote_lot: self.quote_lot,
            pubkey: self.pubkey.clone(),
            authority: clone_keypair(&self.authority),
        }
    }
}

pub struct UserCookie {
    pub key: Keypair,
    pub token_accounts: Vec<Pubkey>,
}
