#!/bin/sh
# ===========================================
# Calricula Demo Database Reset Script
# ===========================================
# This script resets the demo database to its original state.
# It's designed to be run daily at midnight by the demo-reset service.
#
# Usage:
#   ./demo-reset.sh              # Reset the demo database
#   ./demo-reset.sh --dry-run    # Show what would be done without making changes
#
# Environment variables (set by docker-compose.demo.yml):
#   PGHOST       - Database host (default: db)
#   PGUSER       - Database user (default: calricula_demo)
#   PGPASSWORD   - Database password
#   PGDATABASE   - Database name (default: calricula_demo)

set -e  # Exit on error

# ===========================================
# Configuration
# ===========================================
DRY_RUN="${1:-}"
LAST_RESET_FILE="/state/demo_last_reset.txt"
BACKUP_FILE="/docker-entrypoint-initdb.d/01_backup.sql"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ===========================================
# Functions
# ===========================================

log_info() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO: $*"
}

log_success() {
    echo "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS: $*${NC}"
}

log_warning() {
    echo "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: $*${NC}"
}

log_error() {
    echo "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*${NC}"
}

check_database_ready() {
    log_info "Checking database connection..."
    if pg_isready -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" > /dev/null 2>&1; then
        log_success "Database is ready"
        return 0
    else
        log_error "Database is not ready"
        return 1
    fi
}

create_golden_backup() {
    # This function creates a "golden master" backup on first run
    # if one doesn't exist
    if [ ! -f "$LAST_RESET_FILE" ] && [ ! -f "$BACKUP_FILE" ]; then
        log_info "Creating initial golden master backup..."
        pg_dump -h "$PGHOST" -U "$PGUSER" "$PGDATABASE" > "$BACKUP_FILE"
        log_success "Golden master backup created at $BACKUP_FILE"
    fi
}

reset_database() {
    if [ "$DRY_RUN" = "--dry-run" ]; then
        log_warning "DRY RUN: Would reset database '$PGDATABASE'"
        return 0
    fi

    log_info "Starting database reset for '$PGDATABASE'..."

    # Drop and recreate the database
    log_info "Dropping existing database..."
    psql -h "$PGHOST" -U "$PGUSER" -d postgres -c "DROP DATABASE IF EXISTS $PGDATABASE;" || {
        log_error "Failed to drop database"
        return 1
    }

    log_info "Creating fresh database..."
    psql -h "$PGHOST" -U "$PGUSER" -d postgres -c "CREATE DATABASE $PGDATABASE;" || {
        log_error "Failed to create database"
        return 1
    }

    # Restore from the golden master backup
    if [ -f "$BACKUP_FILE" ]; then
        log_info "Restoring from golden master backup..."
        psql -h "$PGHOST" -U "$PGUSER" "$PGDATABASE" < "$BACKUP_FILE" || {
            log_error "Failed to restore from backup"
            return 1
        }
        log_success "Database restored from backup"
    else
        log_warning "No backup file found. Database is empty."
        log_info "Run the seed script to populate the database:"
        log_info "  docker compose -f docker-compose.demo.yml exec backend python -m seeds.seed_all"
    fi

    # Update last reset timestamp
    date '+%Y-%m-%d %H:%M:%S' > "$LAST_RESET_FILE"
    log_success "Database reset completed successfully"
}

show_reset_info() {
    if [ -f "$LAST_RESET_FILE" ]; then
        LAST_RESET=$(cat "$LAST_RESET_FILE")
        log_info "Last reset: $LAST_RESET"
    else
        log_info "No previous reset recorded"
    fi
}

# ===========================================
# Main Script
# ===========================================

main() {
    log_info "============================================"
    log_info "Calricula Demo Database Reset"
    log_info "============================================"

    show_reset_info

    # Check if database is ready
    if ! check_database_ready; then
        log_error "Database is not accessible. Exiting."
        exit 1
    fi

    # Create golden master backup on first run if needed
    create_golden_backup

    # Reset the database
    if reset_database; then
        log_success "Demo database has been reset!"
        log_info "Users with 'demo' in their email can now access the fresh demo environment."
    else
        log_error "Failed to reset demo database"
        exit 1
    fi
}

# Run main function
main "$@"
