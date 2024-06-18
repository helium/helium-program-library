#!/bin/bash

CLUSTER=$1

if [ "$CLUSTER" == "mainnet" ]; then
    CLUSTER_URL='https://api.mainnet-beta.solana.com'
elif [ "$CLUSTER" == "devnet" ]; then
    CLUSTER_URL='https://api.devnet.solana.com'
else
    CLUSTER_URL='http://127.0.0.1:8899'
    ./scripts/init-idls.sh
fi

wait

set -e


# create keypairs if they don't exist
KEYPAIRS=( 'aggregator-IOT.json' 'aggregator-MOBILE.json' 'hnt-price-oracle.json' 'hnt.json' 'hst.json' 'dc.json' 'mobile.json' 'iot.json' 'council.json' 'aggregator-IOT.json' 'aggregator-MOBILE.json' 'merkle.json' 'oracle.json' )
for f in "${KEYPAIRS[@]}"; do
	if [ ! -f "./packages/helium-admin-cli/keypairs/$f" ]; then
        echo "$f keypair doesn't exist, creating it"
        solana-keygen new --no-bip39-passphrase -o ./packages/helium-admin-cli/keypairs/$f -s
    fi
done

RND=$RANDOM
echo "Using $RND for dao names"


./packages/helium-admin-cli/bin/helium-admin.js create-price-oracle -u $SOLANA_URL \
                                 --wallet $ANCHOR_WALLET \
                                 --priceOracleKeypair ./packages/helium-admin-cli/keypairs/hnt-price-oracle.json \
                                 --oracles packages/helium-admin-cli/price-oracle-authorities.json \
                                 --decimals 8

# init the dao and subdaos
./packages/helium-admin-cli/bin/helium-admin.js create-dao \
<<<<<<< HEAD
    --hntPriceOracle 7moA1i5vQUpfDwSpK6Pw9s56ahB7WFGidtbL2ujWrVvm \
    --numHnt 200136852 --numHst 200000000 --numDc 2000000000000 --realmName "Helium" -u $CLUSTER_URL
=======
    --hntPriceOracle 4DdmDswskDxXGpwHrXUfn2CNUm9rt21ac79GHNTN3J33 \
    --numHnt 200136852 --numHst 200000000 --numDc 2000000000000 --realmName "Helium DAO" -u $CLUSTER_URL
>>>>>>> origin/develop

./packages/helium-admin-cli/bin/helium-admin.js create-subdao \
    --hntPubkey $(solana address -k packages/helium-admin-cli/keypairs/hnt.json) \
    -rewardsOracleUrl https://iot-oracle.oracle.test-helium.com \
    -n IOT --subdaoKeypair packages/helium-admin-cli/keypairs/iot.json \
    --numTokens 100302580998  --startEpochRewards 65000000000 --realmName "Helium IOT" --dcBurnAuthority $(solana address) -u $CLUSTER_URL --decimals 6 --delegatorRewardsPercent 6 \
    --emissionSchedulePath ./packages/helium-admin-cli/emissions/iot.json

./packages/helium-admin-cli/bin/helium-admin.js create-subdao \
    --hntPubkey $(solana address -k packages/helium-admin-cli/keypairs/hnt.json) \
    -rewardsOracleUrl https://mobile-oracle.oracle.test-helium.com \
    -n MOBILE --subdaoKeypair packages/helium-admin-cli/keypairs/mobile.json \
    --numTokens 100302580998 --startEpochRewards 66000000000 --realmName "Helium MOBILE" --decimals 6 \
    --dcBurnAuthority $(solana address) -u $CLUSTER_URL --delegatorRewardsPercent 6 --emissionSchedulePath ./packages/helium-admin-cli/emissions/mobile.json

# if test -f "./packages/helium-admin-cli/makers.json"; then
#   ./packages/helium-admin-cli/bin/helium-admin.js create-maker -u $CLUSTER --symbol IOT --subdaoMint $(solana address -k packages/helium-admin-cli/keypairs/iot.json) --fromFile packages/helium-admin-cli/makers.json --councilKeypair ./packages/helium-admin-cli/keypairs/council.json
# fi
# if test -f "./packages/helium-admin-cli/makers-mobile.json"; then
#   ./packages/helium-admin-cli/bin/helium-admin.js create-maker -u $CLUSTER --symbol MOBILE --subdaoMint $(solana address -k packages/helium-admin-cli/keypairs/mobile.json) --fromFile packages/helium-admin-cli/makers-mobile.json --councilKeypair ./packages/helium-admin-cli/keypairs/council.json
# fi

# save the keypairs as environment variables (used by other packages)
export DC_MINT=$(solana address -k ./packages/helium-admin-cli/keypairs/dc.json)
export HNT_MINT=$(solana address -k ./packages/helium-admin-cli/keypairs/hnt.json)
export IOT_MINT=$(solana address -k ./packages/helium-admin-cli/keypairs/iot.json)
export MOBILE_MINT=$(solana address -k ./packages/helium-admin-cli/keypairs/mobile.json)
export ORACLE_MINT=$(solana address -k ./packages/helium-admin-cli/keypairs/oracle.json)
