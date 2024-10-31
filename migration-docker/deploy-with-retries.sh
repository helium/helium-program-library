#!/bin/bash

# Define the Solana program source code file
PROGRAM_SOURCE_FILE=$1
KEYPAIR=$2

# Generate a buffer signer keypair
solana-keygen new --force --no-bip39-passphrase -o buffer.json

# Set the maximum number of retries to 5
MAX_RETRIES=5
CURRENT_RETRY=0

# Deploy the program with the buffer signer keypair
while [[ $CURRENT_RETRY -lt $MAX_RETRIES ]]; do
  echo "Deploying program (retry $((CURRENT_RETRY+1)))..."
  solana program deploy $PROGRAM_SOURCE_FILE --with-compute-unit-price 2 --buffer buffer.json -u $SOLANA_URL --program-id $KEYPAIR

  # Check if the deploy command succeeded
  if [[ $? -eq 0 ]]; then
    echo "Program deployed successfully."
    break
  fi

  CURRENT_RETRY=$((CURRENT_RETRY+1))
  echo "Deploy failed. Retrying in 5 seconds..."
  sleep 5
done

# Clean up the buffer signer keypair if it was generated in this script
if [[ $BUFFER_SIGNER_KEYPAIR != "" ]]; then
  rm $BUFFER_SIGNER_KEYPAIR
fi