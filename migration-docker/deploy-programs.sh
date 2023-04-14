#!/bin/bash

SCRIPT_DIR=$(dirname "$(readlink -f "$0")")

# Loop through each directory within the `programs` directory
for DIR in programs/*/; do
  # Get the directory name in snake_case
  DIR_NAME=$(echo "$(basename "$DIR")" | tr '[:upper:]' '[:lower:]' | tr '-' '_')

  KEYPAIR_NAME="$(pwd)/target/deploy/$DIR_NAME-keypair.json"

  if [ -f "$KEYPAIR_NAME" ]; then
    # Deploy the program with the generated keypair file
    $SCRIPT_DIR/deploy-with-retries.sh ./target/deploy/$DIR_NAME.so $KEYPAIR_NAME
  fi;
done
