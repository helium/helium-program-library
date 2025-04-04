#!/bin/bash
set -e

DATA_DIR="/data"
ES_INDEX_DIR="${DATA_DIR}/photon_data/elasticsearch"
USER_AGENT="docker: helium/geocoder-service"
DOWNLOAD_URL="http://download1.graphhopper.com/public/photon-db-latest.tar.bz2"

# Download elasticsearch index
if [ ! -d "${ES_INDEX_DIR}" ]; then
    echo "Downloading search index..."
    if ! wget -q --show-progress --user-agent="${USER_AGENT}" -O - "${DOWNLOAD_URL}" | pbzip2 -cd | tar x -C "${DATA_DIR}"; then
        echo "Error: Failed to download or extract the search index."
        exit 1
    fi
fi

# Start service if elastic index exists
if [ -d "${ES_INDEX_DIR}" ]; then
    echo "Starting service..."
    exec java -jar photon.jar -data-dir="${DATA_DIR}" "$@"
else
    echo "Could not start service, the search index could not be found"
    exit 1
fi