#!/bin/bash

# Testing script to reroll all keypairs inside a file
IN=$1
OUT=$2

for jsonfile in $1/*.json ; 
do
  solana-keygen new --force --no-bip39-passphrase -o $2/$(echo $jsonfile | cut -d'/' -f2-)
done;

for jsonfile in $1/programs/*.json ; 
do
  solana-keygen new --force --no-bip39-passphrase -o $2/$(echo $jsonfile | cut -d'/' -f2-)
done;