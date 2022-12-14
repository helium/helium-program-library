#!/bin/bash

./scripts/init-idls.sh

# create keypairs if they don't exist
KEYPAIRS=( 'hnt.json' 'hst.json' 'dc.json' 'mobile.json' 'iot.json' 'council.json' 'aggregator.json' 'merkle.json' 'oracle.json' )
for f in "${KEYPAIRS[@]}"; do
	if [ ! -f "./packages/helium-cli/keypairs/$f" ]; then
        echo "$f keypair doesn't exist, creating it"
        solana-keygen new -o ./packages/helium-cli/keypairs/$f -s
    fi
done

# init the dao and subdaos
npx ts-node --project ./packages/helium-cli/tsconfig.cjs.json ./packages/helium-cli/src/create-dao.ts \
    --numHnt 200136852 --numHst 200000000 --numDc 2000000000000 --realmName "Helium Test2" --noGovernance

npx ts-node --project ./packages/helium-cli/tsconfig.cjs.json ./packages/helium-cli/src/create-subdao.ts \
    -rewardsOracleUrl https://iot-oracle.oracle.test-helium.com \
    --activeDeviceOracleUrl https://active-devices.oracle.test-helium.com -n IOT --subdaoKeypair packages/helium-cli/keypairs/iot.json \
    --numTokens 100302580998  --startEpochRewards 65000000000 --realmName "Helium IOT Test2" --dcBurnAuthority $(solana address) --noGovernance

npx ts-node --project ./packages/helium-cli/tsconfig.cjs.json ./packages/helium-cli/src/create-subdao.ts \
    -rewardsOracleUrl https://mobile-oracle.oracle.test-helium.com \
    --activeDeviceOracleUrl https://active-devices.oracle.test-helium.com -n Mobile --subdaoKeypair packages/helium-cli/keypairs/mobile.json \
    --numTokens 100302580998 --startEpochRewards 66000000000 --realmName "Helium Mobile Test2" \
    --dcBurnAuthority $(solana address)  --noHotspots --noGovernance


# save the keypairs as environment variables (used by other packages)
export DC_MINT=$(solana address -k ./packages/helium-cli/keypairs/dc.json)
export HNT_MINT=$(solana address -k ./packages/helium-cli/keypairs/hnt.json)
export IOT_MINT=$(solana address -k ./packages/helium-cli/keypairs/iot.json)
export MOBILE_MINT=$(solana address -k ./packages/helium-cli/keypairs/mobile.json)
export ORACLE_MINT=$(solana address -k ./packages/helium-cli/keypairs/oracle.json)