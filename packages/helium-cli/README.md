```
npx ts-node --project tsconfig.cjs.json src/create-dao.ts -u https://api.devnet.solana.com --numHnt 200136852 --numHst 200000000 --numDc 2000000000000 --realmName "Helium Test4"

npx ts-node --project tsconfig.cjs.json src/create-subdao.ts -u https://api.devnet.solana.com -rewardsOracleUrl https://iot-oracle.oracle.test-helium.com --activeDeviceOracleUrl https://active-devices.oracle.test-helium.com -n IOT --subdaoKeypair keypairs/iot.json --numTokens 100302580998  --startEpochRewards 65000000000 --realmName "Helium IOT Test4" --dcBurnAuthority $(solana address)

 npx ts-node --project tsconfig.cjs.json src/create-subdao.ts -u https://api.devnet.solana.com -rewardsOracleUrl https://mobile-oracle.oracle.test-helium.com --activeDeviceOracleUrl https://active-devices.oracle.test-helium.com -n Mobile --subdaoKeypair keypairs/mobile.json --numTokens 100302580998 --startEpochRewards 66000000000 --realmName "Helium Mobile Test4" --dcBurnAuthority $(solana address)  --noHotspots
```
Now, go approve and run all commands in realms.

```
npx ts-node --project tsconfig.cjs.json src/create-maker.ts -u https://api.devnet.solana.com -n IOT --subdaoMint $(solana address -k keypairs/iot.json) --makerKey 13EYmQgDF1ScLxXfugVrFCa3HiJUALwsaLBHJpTsXx1KP6UncH7

npx ts-node --project tsconfig.cjs.json src/mint-dc.ts -u https://api.devnet.solana.com --destination 3ZwL45WPyjKg3GejkGTbP6kMCQcr73qkVCdQL3Afb3Cx --numHnt 10000 --dcKey $(solana address -k keypairs/dc.json)
```

Now, go approve and run maker create in realms


```
 cd ../migration-service

 node --max_old_space_size=16000 lib/cjs/gen-transactions.js --mobile $(solana address -k ../helium-cli/keypairs/mobile.json) --hnt $(solana address -k ../helium-cli/keypairs/hnt.json) --dc $(solana address -k ../helium-cli/keypairs/dc.json) --iot $(solana address -k ../helium-cli/keypairs/iot.json) --hst $(solana address -k ../helium-cli/keypairs/hst.json) -n testhelium4 -u https://api.devnet.solana.com -p --payer $(solana address) --pgPort 5432 --pgDatabase migration
```

At this point, go and update all lazy signers with the value from -n (ie tessthelium4)

Must also then go update all state in the cluster