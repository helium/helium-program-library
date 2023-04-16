#!/bin/bash

set -e

# Replace the lazy transactions name with the real one
find programs -type f -name '*.rs' -exec sed -i "s/b\"devnethelium5\"/b\"$LAZY_NAME\"/g" {} \;

# Download files from s3
aws s3 cp s3://$S3_BUCKET/makers.json . --region $AWS_REGION --endpoint $S3_ENDPOINT
aws s3 cp s3://$S3_BUCKET/makers-mobile.json . --region $AWS_REGION --endpoint $S3_ENDPOINT
aws s3 cp s3://$S3_BUCKET/export.json . --region $AWS_REGION --endpoint $S3_ENDPOINT
aws s3 cp s3://$S3_BUCKET/keypairs.tar.gz.asc . --region $AWS_REGION --endpoint $S3_ENDPOINT

gpg --batch --import $GPG_KEY
gpg --pinentry-mode=loopback --batch --passphrase $GPG_PASSWORD -o keypairs.tar.gz -d keypairs.tar.gz.asc 
tar -xvf keypairs.tar.gz

cp keypairs/$ADMIN_KEYPAIR ~/.config/solana/id.json
ANCHOR_WALLET=~/.config/solana/id.json

if [[ $SOLANA_URL == *"127.0.0.1"* ]]; then
  # If the SOLANA_URL environment variable includes "127.0.0.1"
  # Run the local-validator.sh script as a daemon
  nohup ./local-validator.sh > /dev/null 2>&1 &

  echo "Local validator started"
else
  echo "SOLANA_URL does not include 127.0.0.1"
fi

mkdir -p target/deploy
cp keypairs/programs/* target/deploy/ 

# Build and deploy the contracts with genesis disabled
anchor build -- --features no-genesis
./deploy-programs.sh
./init-idls.sh $SOLANA_URL

pushd packages/helium-admin-cli && yarn link && popd

TOTAL_STAKED_HNT=$(helium-admin sum-tokens --token staked_hnt --state export.json --decimals 8)
TOTAL_UNSTAKED_HNT=$(helium-admin sum-tokens --token hnt --state export.json --decimals 8)
TOTAL_HNT=$(echo "$TOTAL_STAKED_HNT + $TOTAL_UNSTAKED_HNT" | bc)
TOTAL_MOBILE=$(helium-admin sum-tokens --token mobile --state export.json --decimals 8)
TOTAL_IOT=5000000000 # 5 billion premine
TOTAL_DC=$(helium-admin sum-tokens --token dc --state export.json --decimals 0)

helium-admin create-price-oracle -u $SOLANA_URL \
                                 --wallet $ANCHOR_WALLET \
                                 --multisig $MULTISIG \
                                 --priceOracleKeypair keypairs/hnt-price-oracle.json \
                                 --oracles packages/helium-admin-cli/price-oracle-authorities.json \
                                 --decimals 8

helium-admin create-price-oracle -u $SOLANA_URL \
                                 --wallet $ANCHOR_WALLET \
                                 --multisig $MULTISIG \
                                 --priceOracleKeypair keypairs/iot-price-oracle.json \
                                 --oracles packages/helium-admin-cli/price-oracle-authorities.json \
                                 --decimals 6

helium-admin create-price-oracle -u $SOLANA_URL \
                                 --wallet $ANCHOR_WALLET \
                                 --multisig $MULTISIG \
                                 --priceOracleKeypair keypairs/mobile-price-oracle.json \
                                 --oracles packages/helium-admin-cli/price-oracle-authorities.json \
                                 --decimals 6

# Mint extra tokens since we do not know how many will be needed for the migration until the export is run
helium-admin create-dao -u $SOLANA_URL \
                        --multisig $MULTISIG \
                        --councilKeypair keypairs/council.json \
                        --hntKeypair keypairs/hnt.json \
                        --dcKeypair keypairs/dc.json \
                        --hntPriceOracle $(solana address -k keypairs/hnt-price-oracle.json) \
                        --wallet $ANCHOR_WALLET \
                        --numHnt $TOTAL_HNT  \
                        --numHst 200000000  \
                        --numDc $TOTAL_DC  \
                        --oracleKeypair keypairs/oracle.json \
                        --merkleKeypair keypairs/merkle.json \
                        --realmName "Helium" \
                        --emissionSchedulePath packages/helium-admin-cli/emissions/hnt.json \
                        --hstEmissionSchedulePath packages/helium-admin-cli/emissions/hst.json

helium-admin setup-hst -u $SOLANA_URL \
                      --multisig $MULTISIG \
                      --hnt $(solana address -k keypairs/hnt.json)  \
                      --name "HST" \
                      --hstKeypair keypairs/hst.json \
                      --hstReceiptBasePath keypairs \
                      --state export.json      

helium-admin create-subdao -u $SOLANA_URL \
                           --councilKeypair keypairs/council.json \
                           --aggregatorKeypair keypairs/aggregator-IOT.json \
                           --subdaoKeypair keypairs/iot.json \
                           --oracleKeypair keypairs/oracle.json \
                           --wallet $ANCHOR_WALLET \
                           --multisig $MULTISIG \
                           --rewardsOracleUrl https://iot-rewards.oracle.helium.io \
                           --activeDeviceOracleUrl https://iot-rewards.oracle.helium.io/active-devices  \
                           -n IOT \
                           --hntPubkey $(solana address -k keypairs/hnt.json) \
                           --dcPubkey $(solana address -k keypairs/dc.json) \
                           --numTokens $TOTAL_IOT \
                           --emissionSchedulePath packages/helium-admin-cli/emissions/iot.json \
                           --realmName "Helium IOT" \
                           --dcBurnAuthority $DC_BURN_AUTHORITY \
                           --executeTransaction \
                           --decimals 6 \
                           --delegatorRewardsPercent 9.090909090909091 \
                           --queue $ORACLE_QUEUE \
                           --crank $ORACLE_CRANK \
                           --switchboardNetwork $NETWORK
                  
helium-admin create-subdao -u $SOLANA_URL \
                           --councilKeypair keypairs/council.json \
                           --wallet $ANCHOR_WALLET \
                           --subdaoKeypair keypairs/mobile.json \
                           --oracleKeypair keypairs/oracle.json \
                           --aggregatorKeypair keypairs/aggregator-MOBILE.json \
                           --multisig $MULTISIG \
                           --rewardsOracleUrl https://mobile-rewards.oracle.helium.io \
                           --activeDeviceOracleUrl https://mobile-rewards.oracle.helium.io/active-devices  \
                           -n MOBILE \
                           --hntPubkey $(solana address -k keypairs/hnt.json) \
                           --dcPubkey $(solana address -k keypairs/dc.json) \
                           --numTokens $TOTAL_MOBILE \
                           --emissionSchedulePath packages/helium-admin-cli/emissions/mobile.json \
                           --realmName "Helium MOBILE" \
                           --dcBurnAuthority $DC_BURN_AUTHORITY \
                           --executeTransaction \
                           --decimals 6 \
                           --delegatorRewardsPercent 6.451612903225806 \
                           --queue $ORACLE_QUEUE \
                           --crank $ORACLE_CRANK \
                           --switchboardNetwork $NETWORK

helium-admin create-maker -u $SOLANA_URL \
                          --wallet $ANCHOR_WALLET \
                          --symbol IOT \
                          --subdaoMint $(solana address -k keypairs/iot.json) \
                          --fromFile makers.json \
                          --multisig $MULTISIG \
                          --merkleBasePath keypairs \
                          --executeTransaction
helium-admin create-maker -u $SOLANA_URL \
                          --wallet $ANCHOR_WALLET \
                          --symbol MOBILE \
                          --subdaoMint $(solana address -k keypairs/mobile.json) \
                          --fromFile makers-mobile.json \
                          --multisig $MULTISIG \
                          --merkleBasePath keypairs \
                          --executeTransaction

node --expose-gc --max_old_space_size=15000 packages/migration-service/lib/cjs/gen-transactions.js \
                                --wallet $ANCHOR_WALLET \
                                --state export.json \
                                --mobile $(solana address -k keypairs/mobile.json) \
                                --hnt $(solana address -k keypairs/hnt.json) \
                                --dc $(solana address -k keypairs/dc.json) \
                                --iot $(solana address -k keypairs/iot.json) \
                                --hst $(solana address -k keypairs/hst.json) \
                                --validatorHeartbeatThreshold $VALIDATOR_HEARTBEAT_THRESHOLD \
                                -n $LAZY_NAME \
                                -u $SOLANA_URL \
                                --payer $(solana address) \
                                --pgPort $PGPORT \
                                --pgHost $PGHOST \
                                --pgUser $PGUSER \
                                --pgDatabase $PGDATABASE \
                                --makers makers.json \
                                --awsRegion $AWS_REGION \
                                --fail ./failures.json \
                                --canopyKeypair keypairs/canopy.json \
                                -p

# Write failed to aws
aws s3 mv failures.json s3://$S3_BUCKET/failures.json --region $AWS_REGION --endpoint $S3_ENDPOINT


# Build and deploy the contracts with genesis enabled
anchor build
./deploy-programs.sh

# Fund the oracle account to pay for the recipients rent
solana transfer -u $SOLANA_URL $(solana address -k keypairs/oracle.json) $ORACLE_SOL --allow-unfunded-recipient
