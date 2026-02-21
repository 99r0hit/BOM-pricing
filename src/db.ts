import Database from 'better-sqlite3';
import path from 'path';

const db = new Database('bom_system.db');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS components (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT,
    description TEXT,
    mpn TEXT UNIQUE NOT NULL,
    make TEXT,
    unit_price_inr REAL,
    unit_price_usd REAL,
    source TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Create indexes
  CREATE INDEX IF NOT EXISTS idx_components_mpn ON components(mpn);
  CREATE INDEX IF NOT EXISTS idx_components_category ON components(category);
`);

// Seed an admin user if not exists (password: admin123)
// In a real app, you'd use a more secure way to seed
const adminExists = db.prepare('SELECT * FROM users WHERE email = ?').get('admin@example.com');
if (!adminExists) {
  // Using a simple hash for now, but in the server we'll use bcrypt
  // For seeding, we'll just insert a placeholder and the server will handle it or we use a pre-hashed value
  // Let's just leave it for the server to handle on first run or use a known hash
}

export default db;
