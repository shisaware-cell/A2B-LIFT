import crypto from "node:crypto";
import type { MatricDanceDetails, MatricStatus } from "../shared/matric-dance";
export type MatricBooking = { id: string; userId: string; details: MatricDanceDetails; status: MatricStatus; adminNote: string; quoteAmount: number | null; createdAt: string; updatedAt: string; revision: number };
export interface MatricStore {
  list(userId?: string): Promise<MatricBooking[]>;
  create(userId: string, details: MatricDanceDetails): Promise<MatricBooking>;
  get(id: string): Promise<MatricBooking | undefined>;
  update(id: string, expected: MatricStatus, patch: { status: MatricStatus; adminNote?: string; quoteAmount?: number | null }, revision: number): Promise<MatricBooking | undefined>;
}
interface SqlClient { query(query: string, values?: any[]): Promise<{ rows: any[] }> }
export function createMatricStore(pool: SqlClient): MatricStore {
  let ready: Promise<unknown> | undefined;
  function ensure() {
    return ready ||= pool.query(`CREATE TABLE IF NOT EXISTS matric_dance_bookings (
      id uuid PRIMARY KEY, user_id varchar NOT NULL REFERENCES users(id), details jsonb NOT NULL,
      revision integer NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'requested', admin_note text NOT NULL DEFAULT '', quote_amount numeric(12,2),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    ); ALTER TABLE matric_dance_bookings ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0; ALTER TABLE matric_dance_bookings ENABLE ROW LEVEL SECURITY;`).then(() => pool.query(`CREATE INDEX IF NOT EXISTS matric_dance_user_created ON matric_dance_bookings(user_id, created_at DESC)`)).catch(e => { ready = undefined; throw e; });
  }
  function row(r: any): MatricBooking { return { id:r.id, userId:r.user_id, details:r.details, status:r.status, adminNote:r.admin_note, quoteAmount:r.quote_amount == null ? null : Number(r.quote_amount), createdAt:r.created_at, updatedAt:r.updated_at, revision:r.revision }; }
  return {
    async list(userId) { await ensure(); const r = await pool.query(userId ? 'SELECT * FROM matric_dance_bookings WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200' : 'SELECT * FROM matric_dance_bookings ORDER BY created_at DESC LIMIT 500', userId ? [userId] : []); return r.rows.map(row); },
    async create(userId, details) { await ensure(); const r = await pool.query('INSERT INTO matric_dance_bookings(id,user_id,details) VALUES($1,$2,$3::jsonb) RETURNING *',[crypto.randomUUID(),userId,JSON.stringify(details)]); return row(r.rows[0]); },
    async get(id) { await ensure(); const r = await pool.query('SELECT * FROM matric_dance_bookings WHERE id=$1',[id]); return r.rows[0] && row(r.rows[0]); },
    async update(id, expected, patch, revision) { await ensure(); const r=await pool.query(`UPDATE matric_dance_bookings SET status=$3,admin_note=COALESCE($4,admin_note),quote_amount=COALESCE($5,quote_amount),updated_at=now(),revision=revision+1 WHERE id=$1 AND status=$2 AND revision=$6 RETURNING *`,[id,expected,patch.status,patch.adminNote??null,patch.quoteAmount??null,revision]);return r.rows[0] && row(r.rows[0]); },
  };
}
