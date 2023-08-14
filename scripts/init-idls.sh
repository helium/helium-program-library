#!/bin/bash

programs_dir="programs"
pids=()  # Array to store the process IDs

# Get the list of program names from the programs directory
program_list=$(ls "$programs_dir")

# Run anchor idl init for each program
for program in $program_list; do
  underscored=$(echo $program | sed 's/-/_/g')
  id=$(~/.cargo/bin/toml get Anchor.toml programs.localnet.$underscored | tr -d '"')
  filepath="target/idl/${underscored}.json"
  cluster="${1:-localnet}"

  if [ -n "$id" ]; then
    anchor_command="anchor idl init ${id} --filepath ${filepath} --provider.cluster ${cluster} --provider.wallet $HOME/.config/solana/id.json"
    echo "Running command: $anchor_command"

    # Run the anchor idl init command in the background and store the PID
    ($anchor_command) &
    pids+=($!)  # Store the PID of the most recent background process
  else
    echo "Skipping program $program. ID is empty."
  fi
done

# Wait for all background processes to finish
for pid in "${pids[@]}"; do
  wait "$pid"
done
