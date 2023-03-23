#!/bin/bash

while :
do
  anchor localnet --skip-build
  if [ $? -eq 0 ]; then
    echo "Server launched successfully"
    break
  else
    if [[ $(ps aux | grep 'anchor localnet' | wc -l) -gt 2 ]]; then
      echo "Server is already running"
      break
    else
      echo "Failed to launch server, retrying..."
    fi
  fi
done

while :
do
  read -p "Server is running. Press [Enter] to stop the server."
  if [[ $(ps aux | grep 'anchor localnet' | wc -l) -gt 2 ]]; then
    pkill -f 'anchor localnet'
    echo "Server stopped"
    break
  fi
done