// Tiny file-backed store. This is a hackathon-grade persistence layer on
// purpose: a single JSON file on disk, read once at boot and rewritten after
// every mutation. It is not built for concurrent writers or high write
// volume — swap it for a real database (Postgres, Mongo, SQLite) before this
// goes anywhere near production traffic. For a prototype it means your data
// (added patients, audit log, stats) survives a server restart with zero
// external moving parts.

const fs = require('fs');
const path = require('path');
const { SEED_PATIENTS, SEED_AUDIT, SEED_STATS } = require('./seedData');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

function defaultState() {
  return {
    patients: SEED_PATIENTS.map((p) => ({ ...p })),
    auditLog: SEED_AUDIT.map((a) => ({ ...a })),
    stats: { ...SEED_STATS }
  };
}

function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.patients) && Array.isArray(parsed.auditLog) && parsed.stats) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('[store] Failed to read store.json, reinitializing from seed data:', err.message);
  }
  const initial = defaultState();
  persist(initial);
  return initial;
}

function persist(s) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(s, null, 2));
}

// Singleton in-memory state for the process, backed by the JSON file.
const state = load();

function save() {
  persist(state);
}

module.exports = { state, save };
