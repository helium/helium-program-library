use base64::{engine::general_purpose::STANDARD, Engine};
use helium_crypto::Sign;
use helium_crypto::{KeyTag, Keypair};
use helium_proto::BlockchainTxnAddGatewayV1;
use helium_proto::Message;

fn main() {
    let ed25519_key_tag = KeyTag {
        network: helium_crypto::Network::MainNet,
        key_type: helium_crypto::KeyType::Ed25519,
    };

    let gateway_kp = Keypair::generate_from_entropy(
        KeyTag {
            network: helium_crypto::Network::MainNet,
            key_type: helium_crypto::KeyType::EccCompact,
        },
        &[
            248, 55, 78, 168, 99, 123, 22, 203, 36, 250, 136, 86, 110, 119, 198, 170, 248, 55, 78,
            168, 99, 123, 22, 203, 36, 250, 136, 86, 110, 119, 198, 90,
        ],
    )
    .unwrap();
    let owner_kp = Keypair::generate_from_entropy(
        ed25519_key_tag,
        &[
            2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
            26, 27, 28, 29, 30, 31, 32, 33,
        ],
    )
    .unwrap();
    let payer_kp = Keypair::generate_from_entropy(
        ed25519_key_tag,
        &[
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
            25, 26, 27, 28, 29, 30, 31, 32,
        ],
    )
    .unwrap();

    let mut tx = BlockchainTxnAddGatewayV1::default();
    tx.gateway = gateway_kp.public_key().to_vec();
    tx.owner = owner_kp.public_key().to_vec();
    tx.payer = payer_kp.public_key().to_vec();
    tx.staking_fee = 4000000;
    tx.fee = 65000;

    let mut buf = vec![];
    tx.encode(&mut buf).unwrap();

    let signature = gateway_kp.sign(&buf.clone()).unwrap();
    tx.gateway_signature = signature;

    let mut final_buf = vec![];
    tx.encode(&mut final_buf).unwrap();
    let encoded_tx = STANDARD.encode(final_buf);

    println!("encoded_tx: {:?}", encoded_tx);

    // CrsBCiEBQ83AI9ItX54QfRoGk0V9NdHRDrfSHHIRkvVvXeQGZdMSIQBSE5XDRjsZW7Kad8S97uWpQl61Hh2Ipehjm2cE9MF10iJHMEUCIQCJ+n43Jt8zfGXm6yg1dqXE09glwz4Gg72UOyqcdwsRdAIgTVCuCnmPeU6wem99kYIUPrDIpwyBEEhJ7P+4rku13JoqIQF5tVYuj+ZU+UB4sRLoqYunkB+FOuaVvtfg45ELrQSWZDiAkvQBQOj7Aw==
}
