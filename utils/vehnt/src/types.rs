use super::MyResult;
use solana_sdk::pubkey::Pubkey;

pub const HELIUM_DAO_ID: &str = "hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR";

pub const IOT_SUBDAO: &str = "39Lw1RH6zt8AJvKn3BTxmUDofzduCM2J3kSaGDZ8L7Sk";
pub const MOBILE_SUBDAO: &str = "Gm9xDCJawDEKDrrQW6haw94gABaYzQwCq4ZQU8h8bd22";

#[derive(Debug)]
pub enum SubDao {
    Iot,
    Mobile,
}

impl TryFrom<Pubkey> for SubDao {
    type Error = super::error::Error;
    fn try_from(pubkey: Pubkey) -> MyResult<Self> {
        match pubkey.to_string().as_str() {
            IOT_SUBDAO => Ok(SubDao::Iot),
            MOBILE_SUBDAO => Ok(SubDao::Mobile),
            _ => Err(Self::Error::InvalidSubDao(pubkey)),
        }
    }
}
