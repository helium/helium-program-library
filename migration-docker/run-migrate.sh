#!/bin/bash

set +e
time ./migrate.sh
set -e

tail -f /dev/null
