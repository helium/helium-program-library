#!/bin/bash

# solana program dump -u https://api.devnet.solana.com metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s metadata.so
# solana program dump -u https://api.devnet.solana.com BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY bgum.so
# solana program dump -u https://api.devnet.solana.com noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV noop.so
# solana program dump -u https://api.devnet.solana.com cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK compression.so
# solana program dump -u https://api.devnet.solana.com CLoCKyJ6DXBJqqu2VWx9RLbgnwwR6BMHHuyasVmfMzBh clockwork.so
# solana program dump -u https://api.devnet.solana.com hgovkRU6Ghe1Qoyb54HdSLdqN7VtxaifBzRmh9jtd3S gov.so
# solana program dump -u https://api.devnet.solana.com SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f switchboard.so
# solana program dump -u https://api.devnet.solana.com SMPLecH534NA9acpos4G6x7uf3LWbCAwZQE9e8ZekMu sqds.so
# solana account -u https://api.mainnet-beta.solana.com 7moA1i5vQUpfDwSpK6Pw9s56ahB7WFGidtbL2ujWrVvm --output json --output-file pyth.json

# --clone $ORACLE_QUEUE \
  # --clone $ORACLE_CRANK \
  # --clone $SB_STATE \
  # --clone $ORACLE_BUF \
  # --clone $MULTISIG \
# env PGPASSWORD=postgres psql -t -U postgres -h localhost -p 5432 -d solana -c "SELECT address from registrars UNION SELECT address from daos UNION select address from sub_daos UNION SELECT address FROM positions UNION SELECT address FROM delegated_positions UNION SELECT address FROM sub_dao_epoch_infos" |\
# while read -r address; do
#   if [ -z "$address" ]; then
#     continue
#   fi
#   set +e
#   if [ ! -f "accounts/$address.json" ]; then
#     echo "Cloning $address"
#     solana account -u "https://solana-rpc.web.helium.io?session-key=Pluto" $address --output json --output-file accounts/$address.json
#   fi
#   set -e
# done

# args=()

# for file in accounts/*.json; do
#   account_key=$(basename "$file" .json)
#   args+=("--account" "$account_key" "$file")
# done

  # "${args[@]}" \
solana-test-validator \
  --url https://solana-rpc.web.helium.io?session-key=Pluto \
  --account 7moA1i5vQUpfDwSpK6Pw9s56ahB7WFGidtbL2ujWrVvm pyth.json \
  --clone Fi8vncGpNKbq62gPo56G4toCehWNy77GgqGkTaAF5Lkk \
  --bpf-program metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s metadata.so \
  --bpf-program BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY bgum.so \
  --bpf-program noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV noop.so \
  --bpf-program cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK compression.so \
  --bpf-program CLoCKyJ6DXBJqqu2VWx9RLbgnwwR6BMHHuyasVmfMzBh clockwork.so \
  --bpf-program hgovkRU6Ghe1Qoyb54HdSLdqN7VtxaifBzRmh9jtd3S gov.so \
  --bpf-program SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f switchboard.so \
  --bpf-program SMPLecH534NA9acpos4G6x7uf3LWbCAwZQE9e8ZekMu sqds.so \
  --clone FftLLJWbQQhRDv72ihR4Q7259VdPa4AZ3zxJcsB3wjE9 \
  --clone hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux \
  --clone dcuc8Amr83Wz27ZkQ2K9NS6r8zRpf1J6cvArEBDZDmm \
  --clone mb1eu7TzEc71KxDpsmsKoucSSuuoGLv1drys1oP2jh6 \
  --clone iotEVVZLEywoTn1QdwNPddxPWszn3zFhEot3MfL9fns \
  --clone 2VfPJn8ML1hNBnsEBo7SzmG11UJc7gbY8b23A3K8expd \
  --clone UcrnK4w2HXCEjY8z6TcQ9tysYr3c9VcFLdYAU9YQP5e \
  --clone FozqXFMS1nQKfPqwVdChr7RJ3y7ccSux39zU682kNYjJ \
  --clone BKtF8yyQsj3Ft6jb2nkfpEKzARZVdGgdEPs6mFmZNmbA \
  --clone 5JYwqvKkqp35w8Nq3ba4z1WYUeJQ1rB36V8XvaGp6zn1 