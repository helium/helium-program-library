#!/bin/bash

../anchor/target/debug/anchor idl upgrade 1azyvMnX9ptJgr8y18mhAJFQSHfFGjyGtPQ4Lnn99kj --filepath target/idl/lazy_distributor.json --provider.cluster devnet --provider.wallet ~/.config/solana/id.json
../anchor/target/debug/anchor idl upgrade hdaojPkgSD8bciDc1w2Z4kXFFibCXngJiw2GRpEL7Wf --filepath target/idl/helium_sub_daos.json --provider.cluster devnet --provider.wallet ~/.config/solana/id.json
../anchor/target/debug/anchor idl upgrade credacwrBVewZAgCwNgowCSMbCiepuesprUWPBeLTSg --filepath target/idl/data_credits.json --provider.cluster devnet --provider.wallet ~/.config/solana/id.json
../anchor/target/debug/anchor idl upgrade circcmKGcSE61r768bFtD1GkG3x6qfEE1GD2PgwA6C3 --filepath target/idl/circuit_breaker.json --provider.cluster devnet --provider.wallet ~/.config/solana/id.json
../anchor/target/debug/anchor idl upgrade isswTaVr3jpPq4ETgnCu76WQA9XPxPGVANeKzivHefg --filepath target/idl/hotspot_issuance.json --provider.cluster devnet --provider.wallet ~/.config/solana/id.json
../anchor/target/debug/anchor idl upgrade treaRzaa4b98D1NQMQdQXzBupbgWhyJ2e1pXhJzkTwU --filepath target/idl/treasury_management.json --provider.cluster devnet --provider.wallet ~/.config/solana/id.json
Ò