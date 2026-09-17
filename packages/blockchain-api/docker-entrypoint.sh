#!/bin/sh

set -e

# Run database migrations
echo "Running database migrations..."
NODE_ENV=production sequelize-cli db:migrate

# Background services (transaction resubmission) run inside the Fastify
# process via src/app.ts — no separate process needed

# Execute the main container command
exec "$@"
