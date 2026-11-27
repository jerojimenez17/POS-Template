#!/bin/bash
# Restore the Neon backup to a local PostgreSQL container
# Usage: ./scripts/restore-db.sh [container-name]
#
# Prerequisites: Docker must be running and the postgres container must be up.
#
# This script restores the SQL dump (neon-backup.sql) into the specified
# PostgreSQL container. If no container name is given, defaults to "pos-postgres".

CONTAINER="${1:-pos-postgres}"
DB_NAME="celiapos"
DB_USER="postgres"
BACKUP_FILE="neon-backup.sql"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Backup file not found: $BACKUP_FILE"
  echo "   Run 'docker compose up -d' first, then re-run this script."
  exit 1
fi

echo "🔄 Restoring $BACKUP_FILE into container '$CONTAINER'..."
docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < "$BACKUP_FILE"

if [ $? -eq 0 ]; then
  echo "✅ Restore complete!"
else
  echo "❌ Restore failed"
  exit 1
fi
