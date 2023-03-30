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
KEYPAIRS=( 'hnt.json' 'hst.json' 'dc.json' 'mobile.json' 'iot.json' 'council.json' 'aggregator-IOT.json' 'aggregator-MOBILE.json' 'merkle.json' 'oracle.json' )
for f in "${KEYPAIRS[@]}"; do
	if [ ! -f "./packages/helium-admin-cli/keypairs/$f" ]; then
        echo "$f keypair doesn't exist, creating it"
        solana-keygen new --no-bip39-passphrase -o ./packages/helium-admin-cli/keypairs/$f -s
    fi
done

RND=$RANDOM
echo "Using $RND for dao names"

npx ts-node --project ./packages/helium-admin-cli/tsconfig.cjs.json ./packages/helium-admin-cli/src/setup-hst -u $CLUSTER_URL --multisig BBhoCZSUJH8iiXHT5aP6GVbhnX2iY2vWR1BAsuYm7ZUm --hnt $(solana address -k packages/helium-admin-cli/keypairs/hnt.json) --name "HST"

# init the dao and subdaos
npx ts-node --project ./packages/helium-admin-cli/tsconfig.cjs.json ./packages/helium-admin-cli/src/create-dao.ts \
    --numHnt 200136852 --numHst 200000000 --numDc 2000000000000 --realmName "Helium $RND" -u $CLUSTER_URL

npx ts-node --project ./packages/helium-admin-cli/tsconfig.cjs.json ./packages/helium-admin-cli/src/create-subdao.ts \
    -rewardsOracleUrl https://iot-oracle.oracle.test-helium.com \
    --activeDeviceOracleUrl https://active-devices.oracle.test-helium.com -n IOT --subdaoKeypair packages/helium-admin-cli/keypairs/iot.json \
    --numTokens 100302580998  --startEpochRewards 65000000000 --realmName "IOT $RND" --dcBurnAuthority $(solana address) -u $CLUSTER_URL --decimals 6 --delegatorRewardsPercent 6 \
    --emissionSchedulePath ./packages/helium-admin-cli/emissions/iot.json

npx ts-node --project ./packages/helium-admin-cli/tsconfig.cjs.json ./packages/helium-admin-cli/src/create-subdao.ts \
    -rewardsOracleUrl https://mobile-oracle.oracle.test-helium.com \
    --activeDeviceOracleUrl https://active-devices.oracle.test-helium.com -n MOBILE --subdaoKeypair packages/helium-admin-cli/keypairs/mobile.json \
    --numTokens 100302580998 --startEpochRewards 66000000000 --realmName "Mobile $RND" --decimals 6 \
    --dcBurnAuthority $(solana address) -u $CLUSTER_URL --delegatorRewardsPercent 6 --emissionSchedulePath ./packages/helium-admin-cli/emissions/mobile.json

if test -f "./packages/helium-admin-cli/makers.json"; then
  npx ts-node --project ./packages/helium-admin-cli/tsconfig.cjs.json ./packages/helium-admin-cli/src/create-maker.ts -u $CLUSTER --symbol IOT --subdaoMint $(solana address -k packages/helium-admin-cli/keypairs/iot.json) --fromFile packages/helium-admin-cli/makers.json --councilKeypair ./packages/helium-admin-cli/keypairs/council.json
fi
if test -f "./packages/helium-admin-cli/makers-mobile.json"; then
  npx ts-node --project ./packages/helium-admin-cli/tsconfig.cjs.json ./packages/helium-admin-cli/src/create-maker.ts -u $CLUSTER --symbol MOBILE --subdaoMint $(solana address -k packages/helium-admin-cli/keypairs/mobile.json) --fromFile packages/helium-admin-cli/makers-mobile.json --councilKeypair ./packages/helium-admin-cli/keypairs/council.json
fi

# save the keypairs as environment variables (used by other packages)
export DC_MINT=$(solana address -k ./packages/helium-admin-cli/keypairs/dc.json)
export HNT_MINT=$(solana address -k ./packages/helium-admin-cli/keypairs/hnt.json)
export IOT_MINT=$(solana address -k ./packages/helium-admin-cli/keypairs/iot.json)
export MOBILE_MINT=$(solana address -k ./packages/helium-admin-cli/keypairs/mobile.json)
export ORACLE_MINT=$(solana address -k ./packages/helium-admin-cli/keypairs/oracle.json)