// Knex configuration for database migrations.
// Uses SQLite in development/test and PostgreSQL in production.
// Set DATABASE_URL in your .env to override the default SQLite path.

/** @type {import('knex').Knex.Config} */
const base = {
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations',
  },
};

// Issue #317: Read replica configuration
const readReplicaConfig = {
  // Primary connection (writes)
  primary: {
    ...base,
    client: 'pg',
    connection: process.env.DATABASE_URL,
    pool: { min: 2, max: 20 },
  },
  // Replica connections (reads) - comma-separated URLs
  replicas: (process.env.READ_REPLICA_URLS || '')
    .split(',')
    .filter(Boolean)
    .map((url) => ({
      ...base,
      client: 'pg',
      connection: url.trim(),
      pool: { min: 1, max: 15 },
    })),
};

export { readReplicaConfig };

export default {
  development: {
    ...base,
    client: 'better-sqlite3',
    connection: { filename: process.env.DATABASE_URL || './dev.db' },
    useNullAsDefault: true,
  },

  test: {
    ...base,
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
  },

  production: {
    ...base,
    client: 'pg',
    connection: process.env.DATABASE_URL,
    pool: { min: 2, max: 20 },
  },
};
