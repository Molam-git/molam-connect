#!/bin/bash
# Database Migration Script
# Runs all SQL migrations in order

set -e

echo "Starting database migrations..."

# Check required environment variables
if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL environment variable is not set"
  exit 1
fi

# Parse DATABASE_URL
# Format: postgres://user:password@host:port/database
DB_USER=$(echo $DATABASE_URL | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
DB_PASS=$(echo $DATABASE_URL | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')

echo "Database: $DB_NAME"
echo "Host: $DB_HOST:$DB_PORT"
echo "User: $DB_USER"

# Wait for database to be ready
echo "Waiting for database to be ready..."
until PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c '\q' 2>/dev/null; do
  echo "Database is unavailable - sleeping"
  sleep 2
done

echo "Database is ready!"

# Run migrations
MIGRATION_DIR="${MIGRATION_DIR:-./src/migrations}"

if [ ! -d "$MIGRATION_DIR" ]; then
  echo "Error: Migration directory $MIGRATION_DIR does not exist"
  exit 1
fi

echo "Running migrations from $MIGRATION_DIR..."

for migration in $MIGRATION_DIR/*.sql; do
  if [ -f "$migration" ]; then
    echo "Running migration: $(basename $migration)"
    PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$migration"
    echo "✓ Migration completed: $(basename $migration)"
  fi
done

echo "All migrations completed successfully!"
