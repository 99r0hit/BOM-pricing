import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import multer from "multer";
import * as XLSX from "xlsx";
import db from "./src/db.js";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret";

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// Middleware to verify JWT
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: "Unauthorized" });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: "Forbidden" });
    req.user = user;
    next();
  });
};

const isAdmin = (req: any, res: any, next: any) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

// --- Helper Functions ---

const findMpnColumn = (headers: string[]) => {
  const aliases = [
    'mpn', 'mfr part', 'manufacturer part', 'mfg part', 'part number', 
    'part no', 'p/n', 'mfr_part_no', 'mfr_part_number', 'manufacturer_part_number',
    'customer part number', 'internal part number' // sometimes these are used as fallback
  ];
  
  // Exact match first
  let found = headers.find(h => aliases.includes(h.toLowerCase().trim()));
  if (found) return found;

  // Partial match
  found = headers.find(h => {
    const hl = h.toLowerCase();
    return aliases.some(alias => hl.includes(alias));
  });
  
  return found;
};

const findPriceColumns = (headers: string[]) => {
  const inrAliases = ['price inr', 'unit price inr', 'cost inr', 'inr price', 'inr cost'];
  const usdAliases = ['price usd', 'unit price usd', 'cost usd', 'usd price', 'usd cost'];
  
  const inrKey = headers.find(h => inrAliases.includes(h.toLowerCase().trim())) || 
                 headers.find(h => h.toLowerCase().includes('inr') && h.toLowerCase().includes('price'));
  
  const usdKey = headers.find(h => usdAliases.includes(h.toLowerCase().trim())) || 
                 headers.find(h => h.toLowerCase().includes('usd') && h.toLowerCase().includes('price'));
                 
  return { inrKey, usdKey };
};

// --- Auth Routes ---

app.post("/api/auth/register", async (req, res) => {
  const { email, password, role } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const stmt = db.prepare('INSERT INTO users (email, password, role) VALUES (?, ?, ?)');
    stmt.run(email, hashedPassword, role || 'user');
    res.status(201).json({ message: "User registered" });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const user: any = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, user: { email: user.email, role: user.role } });
});

// --- Component Routes ---

app.get("/api/components/search", authenticateToken, (req, res) => {
  const { query } = req.query;
  if (!query) return res.json([]);

  const results = db.prepare(`
    SELECT * FROM components 
    WHERE mpn LIKE ? OR description LIKE ? 
    LIMIT 50
  `).all(`%${query}%`, `%${query}%`);

  res.json(results);
});

// --- BOM Upload Route ---

app.post("/api/bom/preview", authenticateToken, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data: any[] = XLSX.utils.sheet_to_json(worksheet);

    if (data.length === 0) return res.json({ data: [], mpnKey: null });

    const headers = Object.keys(data[0] || {});
    const mpnKey = findMpnColumn(headers);

    if (!mpnKey) {
      return res.status(400).json({ error: "Could not identify MPN column. Please ensure your Excel has a column named 'MPN' or 'Part Number'." });
    }

    const processedData = data.map(row => {
      const mpn = String(row[mpnKey] || '').trim();
      if (!mpn) return { ...row, db_unit_price_inr: null, db_unit_price_usd: null, db_match: 'No MPN' };

      const component: any = db.prepare('SELECT * FROM components WHERE mpn = ?').get(mpn);
      
      if (component) {
        return {
          ...row,
          db_unit_price_inr: component.unit_price_inr,
          db_unit_price_usd: component.unit_price_usd,
          db_match: 'Found'
        };
      } else {
        return {
          ...row,
          db_unit_price_inr: null,
          db_unit_price_usd: null,
          db_match: 'Not Found'
        };
      }
    });

    res.json({ data: processedData, mpnKey });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/bom/upload", authenticateToken, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data: any[] = XLSX.utils.sheet_to_json(worksheet);

    // Find MPN column (case insensitive search for "MPN", "Part Number", etc)
    const headers = Object.keys(data[0] || {});
    const mpnKey = findMpnColumn(headers);

    if (!mpnKey) {
      return res.status(400).json({ error: "Could not identify MPN column in Excel file." });
    }

    const processedData = data.map(row => {
      const mpn = String(row[mpnKey] || '').trim();
      if (!mpn) return { ...row, db_unit_price_inr: null, db_unit_price_usd: null, db_match: 'No MPN' };

      const component: any = db.prepare('SELECT * FROM components WHERE mpn = ?').get(mpn);
      
      if (component) {
        return {
          ...row,
          db_unit_price_inr: component.unit_price_inr,
          db_unit_price_usd: component.unit_price_usd,
          db_match: 'Found'
        };
      } else {
        return {
          ...row,
          db_unit_price_inr: null,
          db_unit_price_usd: null,
          db_match: 'Not Found'
        };
      }
    });

    const newSheet = XLSX.utils.json_to_sheet(processedData);
    const newWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(newWorkbook, newSheet, "Processed BOM");
    
    const buffer = XLSX.write(newWorkbook, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=processed_bom.xlsx');
    res.send(buffer);

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Admin Routes ---

app.get("/api/admin/components", authenticateToken, isAdmin, (req, res) => {
  const results = db.prepare('SELECT * FROM components ORDER BY created_at DESC').all();
  res.json(results);
});

app.post("/api/admin/components", authenticateToken, isAdmin, (req, res) => {
  const { category, description, mpn, make, unit_price_inr, unit_price_usd, source } = req.body;
  try {
    const stmt = db.prepare(`
      INSERT INTO components (category, description, mpn, make, unit_price_inr, unit_price_usd, source)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(category, description, mpn, make, unit_price_inr, unit_price_usd, source);
    res.status(201).json({ message: "Component added" });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.put("/api/admin/components/:id", authenticateToken, isAdmin, (req, res) => {
  const { id } = req.params;
  const { category, description, mpn, make, unit_price_inr, unit_price_usd, source } = req.body;
  try {
    const stmt = db.prepare(`
      UPDATE components 
      SET category = ?, description = ?, mpn = ?, make = ?, unit_price_inr = ?, unit_price_usd = ?, source = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(category, description, mpn, make, unit_price_inr, unit_price_usd, source, id);
    res.json({ message: "Component updated" });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.delete("/api/admin/components/:id", authenticateToken, isAdmin, (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM components WHERE id = ?').run(id);
  res.json({ message: "Component deleted" });
});

app.post("/api/admin/components/import", authenticateToken, isAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data: any[] = XLSX.utils.sheet_to_json(worksheet);

    if (data.length === 0) return res.status(400).json({ error: "Excel file is empty" });

    const headers = Object.keys(data[0] || {});
    const mpnKey = findMpnColumn(headers);
    const { inrKey, usdKey } = findPriceColumns(headers);
    const descKey = headers.find(h => h.toLowerCase().includes('description') || h.toLowerCase().includes('desc'));
    const makeKey = headers.find(h => h.toLowerCase().includes('make') || h.toLowerCase().includes('mfr') || h.toLowerCase().includes('manufacturer'));
    const catKey = headers.find(h => h.toLowerCase().includes('category') || h.toLowerCase().includes('type'));

    if (!mpnKey) {
      return res.status(400).json({ error: "Could not identify MPN column for import." });
    }

    let importedCount = 0;
    let updatedCount = 0;

    const insertStmt = db.prepare(`
      INSERT INTO components (category, description, mpn, make, unit_price_inr, unit_price_usd, source)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const updateStmt = db.prepare(`
      UPDATE components 
      SET category = ?, description = ?, make = ?, unit_price_inr = ?, unit_price_usd = ?, source = ?, updated_at = CURRENT_TIMESTAMP
      WHERE mpn = ?
    `);

    const transaction = db.transaction((rows) => {
      for (const row of rows) {
        const mpn = String(row[mpnKey] || '').trim();
        if (!mpn) continue;

        const category = row[catKey || ''] || 'General';
        const description = row[descKey || ''] || '';
        const make = row[makeKey || ''] || '';
        const unit_price_inr = parseFloat(row[inrKey || ''] || '0');
        const unit_price_usd = parseFloat(row[usdKey || ''] || '0');
        const source = 'Bulk Import';

        const existing = db.prepare('SELECT id FROM components WHERE mpn = ?').get(mpn);

        if (existing) {
          updateStmt.run(category, description, make, unit_price_inr, unit_price_usd, source, mpn);
          updatedCount++;
        } else {
          insertStmt.run(category, description, mpn, make, unit_price_inr, unit_price_usd, source);
          importedCount++;
        }
      }
    });

    transaction(data);

    res.json({ message: `Import complete. ${importedCount} added, ${updatedCount} updated.` });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Vite Middleware ---

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Auto-seed admin if database is empty
    const users = db.prepare('SELECT count(*) as count FROM users').get() as any;
    if (users.count === 0) {
      const hashedPassword = bcrypt.hashSync('admin123', 10);
      db.prepare('INSERT INTO users (email, password, role) VALUES (?, ?, ?)').run('admin@example.com', hashedPassword, 'admin');
      console.log('Admin user seeded: admin@example.com / admin123');
      
      // Seed some dummy components
      const components = [
        ['Capacitors', 'CAP ALUM 47UF 20% 50V SMD', 'EEE-FK1H470P', 'Panasonic', 12.5, 0.15, 'DigiKey'],
        ['Resistors', 'RES 10K OHM 1% 1/4W 1206', 'RC1206FR-0710KL', 'Yageo', 0.5, 0.006, 'Mouser'],
        ['ICs', 'IC MCU 32BIT 1MB FLASH 100LQFP', 'STM32F407VGT6', 'STMicroelectronics', 850.0, 10.2, 'Arrow']
      ];
      const stmt = db.prepare('INSERT INTO components (category, description, mpn, make, unit_price_inr, unit_price_usd, source) VALUES (?, ?, ?, ?, ?, ?, ?)');
      components.forEach(c => stmt.run(...c));
      console.log('Sample components seeded');
    }
  });
}

startServer();
