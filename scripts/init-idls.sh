#!/bin/bash
### USAGE: './init-idls.sh' will init the idls on localnet. './init-idls.sh <cluster>' will init the idls on <cluster>

anchor idl init 1azyvMnX9ptJgr8y18mhAJFQSHfFGjyGtPQ4Lnn99kj --filepath target/idl/lazy_distributor.json --provider.cluster ${1:-localnet} --provider.wallet ~/.config/solana/id.json
anchor idl init hdaojPkgSD8bciDc1w2Z4kXFFibCXngJiw2GRpEL7Wf --filepath target/idl/helium_sub_daos.json --provider.cluster ${1:-localnet} --provider.wallet ~/.config/solana/id.json
anchor idl init credacwrBVewZAgCwNgowCSMbCiepuesprUWPBeLTSg --filepath target/idl/data_credits.json --provider.cluster ${1:-localnet} --provider.wallet ~/.config/solana/id.json
anchor idl init circcmKGcSE61r768bFtD1GkG3x6qfEE1GD2PgwA6C3 --filepath target/idl/circuit_breaker.json --provider.cluster ${1:-localnet} --provider.wallet ~/.config/solana/id.json
anchor idl init hemABtqNUst4MmqsVcuN217ZzBspENbGt9uueSe5jts --filepath target/idl/helium_entity_manager.json --provider.cluster ${1:-localnet} --provider.wallet ~/.config/solana/id.json
anchor idl init treaRzaa4b98D1NQMQdQXzBupbgWhyJ2e1pXhJzkTwU --filepath target/idl/treasury_management.json --provider.cluster ${1:-localnet} --provider.wallet ~/.config/solana/id.json
anchor idl init 1atNarMiQ8RMLkcTwqHHUESs2f4SB3uouPKFLbXcMwE --filepath target/idl/lazy_transactions.json --provider.cluster ${1:-localnet} --provider.wallet ~/.config/solana/id.json

