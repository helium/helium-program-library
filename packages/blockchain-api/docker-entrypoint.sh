#!/bin/sh

set -e

# Fail before the migrations run, since they drop tables and cannot be reverted
echo "Validating environment..."
node -e "require('./lib/lib/env.js')"

# Run database migrations
echo "Running database migrations..."
NODE_ENV=production sequelize-cli db:migrate

# Background services (transaction resubmission) run inside the Fastify
# process via src/app.ts — no separate process needed

# Execute the main container command
exec "$@"
