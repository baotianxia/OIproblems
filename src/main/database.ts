import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

let db: Database.Database

export function initDatabase(): void {
  const userDataPath = app.getPath('userData')
  const dbPath = join(userDataPath, 'todolist.db')

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  createTables()
}

function createTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parent_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sheets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      folder_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS parts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      sheet_id INTEGER NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS problems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      part_id INTEGER REFERENCES parts(id) ON DELETE CASCADE,
      sheet_id INTEGER REFERENCES sheets(id) ON DELETE CASCADE,
      sort_order INTEGER DEFAULT 0,
      completed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ui_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  const cols = db.prepare("PRAGMA table_info('sheets')").all() as any[]
  const fk = cols.find(c => c.name === 'folder_id')
  if (fk && fk.notnull) {
    db.pragma('foreign_keys = OFF')
    db.exec(`
      CREATE TABLE sheets_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        folder_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
      INSERT INTO sheets_new SELECT * FROM sheets;
      DROP TABLE sheets;
      ALTER TABLE sheets_new RENAME TO sheets;
    `)
    db.pragma('foreign_keys = ON')
  }

  const descCols = db.prepare("PRAGMA table_info('sheets')").all() as any[]
  if (!descCols.find(c => c.name === 'description')) {
    db.exec("ALTER TABLE sheets ADD COLUMN description TEXT DEFAULT ''")
  }

  const fdescCols = db.prepare("PRAGMA table_info('folders')").all() as any[]
  if (!fdescCols.find(c => c.name === 'description')) {
    db.exec("ALTER TABLE folders ADD COLUMN description TEXT DEFAULT ''")
  }
}

export function getDb(): Database.Database {
  return db
}
