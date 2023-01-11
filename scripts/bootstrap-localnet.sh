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


# create keypairs if they don't exist
KEYPAIRS=( 'hnt.json' 'hst.json' 'dc.json' 'mobile.json' 'iot.json' 'council.json' 'aggregator.json' 'merkle.json' 'oracle.json' )
for f in "${KEYPAIRS[@]}"; do
	if [ ! -f "./packages/helium-cli/keypairs/$f" ]; then
        echo "$f keypair doesn't exist, creating it"
        solana-keygen new -o ./packages/helium-cli/keypairs/$f -s --no-bip39-passphrase
    fi
done

# init the dao and subdaos
npx ts-node --project ./packages/helium-cli/tsconfig.cjs.json ./packages/helium-cli/src/create-dao.ts \
    --numHnt 200136852 --numHst 200000000 --numDc 2000000000000 --realmName "HeliumT Test4" --noGovernance -u $CLUSTER_URL

npx ts-node --project ./packages/helium-cli/tsconfig.cjs.json ./packages/helium-cli/src/create-subdao.ts \
    -rewardsOracleUrl https://iot-oracle.oracle.test-helium.com \
    --activeDeviceOracleUrl https://active-devices.oracle.test-helium.com -n IOT --subdaoKeypair packages/helium-cli/keypairs/iot.json \
    --numTokens 100302580998  --startEpochRewards 65000000000 --realmName "HeliumT IOT Test4" --dcBurnAuthority $(solana address) --noGovernance \
    -u $CLUSTER_URL

npx ts-node --project ./packages/helium-cli/tsconfig.cjs.json ./packages/helium-cli/src/create-subdao.ts \
    -rewardsOracleUrl https://mobile-oracle.oracle.test-helium.com \
    --activeDeviceOracleUrl https://active-devices.oracle.test-helium.com -n Mobile --subdaoKeypair packages/helium-cli/keypairs/mobile.json \
    --numTokens 100302580998 --startEpochRewards 66000000000 --realmName "HeliumT Mobile Test4" \
    --dcBurnAuthority $(solana address)  --noHotspots --noGovernance -u $CLUSTER_URL


# save the keypairs as environment variables (used by other packages)
export DC_MINT=$(solana address -k ./packages/helium-cli/keypairs/dc.json)
export HNT_MINT=$(solana address -k ./packages/helium-cli/keypairs/hnt.json)
export IOT_MINT=$(solana address -k ./packages/helium-cli/keypairs/iot.json)
export MOBILE_MINT=$(solana address -k ./packages/helium-cli/keypairs/mobile.json)
export ORACLE_MINT=$(solana address -k ./packages/helium-cli/keypairs/oracle.json)