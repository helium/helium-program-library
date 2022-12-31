```
npx ts-node --project tsconfig.cjs.json src/create-dao.ts -u https://api.devnet.solana.com --numHnt 200136852 --numHst 200000000 --realmName "Test5 Helium"

npx ts-node --project tsconfig.cjs.json src/create-subdao.ts -u https://api.devnet.solana.com -rewardsOracleUrl https://iot-oracle.oracle.test-helium.com --activeDeviceOracleUrl https://active-devices.oracle.test-helium.com -n IOT --subdaoKeypair keypairs/iot.json --numTokens 100302580998  --startEpochRewards 65000000000 --realmName "Test5 IOT" --dcBurnAuthority 3SGfQZ9R2Wj58knHUxfqRXGHXSY8A4ukK7zUdYE4YBkj
```