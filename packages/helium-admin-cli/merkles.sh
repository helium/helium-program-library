#!/bin/bash

# Set the directory path and prefix
directory=$1
prefix="merkle-"

# Loop through all the JSON files in the directory with the given prefix
for file in "$directory/$prefix"*.json; do
    # Run the command with the JSON file's path and key file
    solana address -k "${file}"
done
