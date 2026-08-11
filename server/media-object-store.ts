import crypto from "node:crypto";
import { pool } from "./db";

export type StoredMediaObject = {
  id: string;
  mimeType: string;
  data: Buffer;
};

let ensureTablePromise: Promise<void> | null = null;

export async function ensureMediaObjectStore() {
  if (!ensureTablePromise) {
    ensureTablePromise = pool.query(`
      CREATE TABLE IF NOT EXISTS app_media_objects (
        id varchar PRIMARY KEY,
        owner_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        purpose text NOT NULL,
        mime_type text NOT NULL,
        data bytea NOT NULL,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `).then(() => undefined).catch((error) => {
      ensureTablePromise = null;
      throw error;
    });
  }
  return ensureTablePromise;
}

export async function storeMediaObject(input: {
  ownerUserId: string;
  purpose: string;
  mimeType: string;
  data: Buffer;
}) {
  await ensureMediaObjectStore();
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO app_media_objects (id, owner_user_id, purpose, mime_type, data)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, input.ownerUserId, input.purpose, input.mimeType, input.data],
  );
  return id;
}

export async function getMediaObject(id: string): Promise<StoredMediaObject | null> {
  await ensureMediaObjectStore();
  const result = await pool.query(
    `SELECT id, mime_type, data
       FROM app_media_objects
      WHERE id = $1
      LIMIT 1`,
    [id],
  );
  if (!result.rows[0]) return null;
  return {
    id: result.rows[0].id,
    mimeType: result.rows[0].mime_type,
    data: result.rows[0].data,
  };
}

export async function deleteMediaObject(id: string) {
  await ensureMediaObjectStore();
  await pool.query("DELETE FROM app_media_objects WHERE id = $1", [id]);
}
