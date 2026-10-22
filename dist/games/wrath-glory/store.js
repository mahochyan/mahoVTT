import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
export class WgStore {
    db;
    constructor(path) {
        mkdirSync(dirname(path), { recursive: true });
        this.db = new DatabaseSync(path);
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS wg_sessions(
                id TEXT PRIMARY KEY,
                version INTEGER NOT NULL,
                state_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS wg_events(
                session_id TEXT NOT NULL,
                seq INTEGER NOT NULL,
                type TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY(session_id, seq)
            );
        `);
    }
    create(id, state) {
        const now = new Date().toISOString();
        this.db.prepare('INSERT INTO wg_sessions(id, version, state_json, updated_at) VALUES(?,?,?,?)')
            .run(id, 0, JSON.stringify(state), now);
    }
    load(id) {
        const row = this.db.prepare('SELECT version, state_json FROM wg_sessions WHERE id=?').get(id);
        if (!row)
            return null;
        return { version: Number(row.version), state: JSON.parse(row.state_json) };
    }
    /** CAS save: returns false when another request already advanced the version. */
    save(id, expectedVersion, state, event) {
        const now = new Date().toISOString();
        const result = this.db.prepare('UPDATE wg_sessions SET version=version+1, state_json=?, updated_at=? WHERE id=? AND version=?')
            .run(JSON.stringify(state), now, id, expectedVersion);
        if (Number(result.changes) !== 1)
            return false;
        const seq = Number(this.db.prepare('SELECT COALESCE(MAX(seq),0)+1 AS n FROM wg_events WHERE session_id=?').get(id)?.n ?? 1);
        this.db.prepare('INSERT INTO wg_events(session_id, seq, type, payload_json, created_at) VALUES(?,?,?,?,?)')
            .run(id, seq, event.type, JSON.stringify(event.payload), now);
        return true;
    }
    close() {
        this.db.close();
    }
}
