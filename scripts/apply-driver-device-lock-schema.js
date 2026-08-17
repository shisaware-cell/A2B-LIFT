// Migration: ensure chauffeurs.active_device_id and last_driver_login_at exist
// Usage: node scripts/apply-driver-device-lock-schema.js

require("dotenv").config({ path: ".env.production.local" });
require("dotenv").config();

const { Client } = require("pg");

const sql = `
ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS active_device_id text;
ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS last_driver_login_at timestamp;
`;

(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log("No DATABASE_URL found in environment; skipping direct DB migration execution.");
    process.exit(0);
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");

    console.log("MIGRATION_OK: chauffeurs active_device_id and last_driver_login_at columns ready.");
    await client.end();
  } catch (err) {
    console.error("Migration error:", err.message);
    try { await client.end(); } catch {}
  }
})();
