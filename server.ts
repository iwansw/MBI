import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { initializeApp as initializeAdminApp, cert } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import fs from "fs";
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'firebase-applet-config.json'), 'utf8'));

// Initialize Firebase Admin
initializeAdminApp({
  projectId: firebaseConfig.projectId,
});
const adminDb = firebaseConfig.firestoreDatabaseId 
  ? getAdminFirestore(undefined, firebaseConfig.firestoreDatabaseId)
  : getAdminFirestore(); 

const db = new Database("mbi_service.db");

// ... (keep table creations for local tracking if needed, or remove completely if full Firebase)
// Let's keep the DB for now but disable migration.

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT,
    name TEXT
  );

  CREATE TABLE IF NOT EXISTS brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE
  );

  CREATE TABLE IF NOT EXISTS service_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT,
    customer_phone TEXT,
    customer_address TEXT,
    brand_id INTEGER,
    model TEXT,
    serial_number TEXT,
    issue_description TEXT,
    accessories TEXT,
    status TEXT DEFAULT 'PENDING',
    priority TEXT DEFAULT 'NORMAL',
    technician_id INTEGER,
    operator_id INTEGER,
    is_warranty INTEGER DEFAULT 0,
    rejection_reason TEXT,
    rejected_by_id INTEGER,
    service_notes TEXT,
    down_payment REAL DEFAULT 0,
    service_type TEXT DEFAULT 'WALK_IN',
    request_number TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(brand_id) REFERENCES brands(id),
    FOREIGN KEY(technician_id) REFERENCES users(id),
    FOREIGN KEY(operator_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    part_number TEXT,
    name TEXT,
    price REAL,
    cogs REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS service_parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_request_id INTEGER,
    part_id INTEGER,
    quantity INTEGER,
    price_at_time REAL,
    FOREIGN KEY(service_request_id) REFERENCES service_requests(id),
    FOREIGN KEY(part_id) REFERENCES parts(id)
  );

  CREATE TABLE IF NOT EXISTS billing (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_request_id INTEGER,
    service_fee REAL,
    total_amount REAL,
    status TEXT DEFAULT 'UNPAID',
    invoice_number TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(service_request_id) REFERENCES service_requests(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS service_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_request_id INTEGER,
    technician_id INTEGER,
    note TEXT,
    is_important INTEGER DEFAULT 0,
    is_responded INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(service_request_id) REFERENCES service_requests(id),
    FOREIGN KEY(technician_id) REFERENCES users(id)
  );
`);

// Helper migrations for existing sqlite
try { db.prepare("ALTER TABLE service_requests ADD COLUMN request_number TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE service_requests ADD COLUMN service_type TEXT DEFAULT 'WALK_IN'").run(); } catch(e) {}
try { db.prepare("ALTER TABLE service_requests ADD COLUMN service_notes TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE parts ADD COLUMN part_number TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE parts ADD COLUMN cogs REAL DEFAULT 0").run(); } catch(e) {}
try { db.prepare("ALTER TABLE service_requests ADD COLUMN labor_charge REAL DEFAULT 0").run(); } catch(e) {}
try { db.prepare("ALTER TABLE service_requests ADD COLUMN accessories TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE service_requests ADD COLUMN down_payment REAL DEFAULT 0").run(); } catch(e) {}
try { db.prepare("ALTER TABLE service_requests ADD COLUMN customer_address TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE service_requests ADD COLUMN rejection_reason TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE service_requests ADD COLUMN rejected_by_id INTEGER").run(); } catch(e) {}

// SQLite logic ends

// ... existing code ...

const seed = () => {
  const userCount = db.prepare("SELECT count(*) as count FROM users").get() as { count: number };
  if (userCount.count === 0) {
    const insertUser = db.prepare("INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)");
    insertUser.run("admin", "admin123", "ADMIN", "System Administrator");
    insertUser.run("power", "power123", "POWER_USER", "Power User");
    insertUser.run("tech1", "tech123", "TECHNICIAN", "John Technician");
    insertUser.run("op1", "op123", "OPERATOR", "Sarah Operator");
    insertUser.run("manager", "manager123", "MANAGER", "Mike Manager");

    const insertBrand = db.prepare("INSERT INTO brands (name) VALUES (?)");
    ["EPSON", "Brother", "ASUS", "MSI", "Lenovo", "DAC"].forEach(brand => insertBrand.run(brand));

    const insertPart = db.prepare("INSERT INTO parts (name, price, cogs) VALUES (?, ?, ?)");
    insertPart.run("LCD Screen 15.6", 120.00, 85.00);
    insertPart.run("Keyboard Replacement", 45.00, 25.00);
    insertPart.run("Battery Pack", 60.00, 40.00);
    insertPart.run("Print Head", 85.00, 55.00);

    const insertSetting = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
    insertSetting.run("base_service_fee", "50.00");
    insertSetting.run("warranty_service_fee", "0.00");
    insertSetting.run("company_name", "MBI Service Center");
    insertSetting.run("company_address", "123 Tech Avenue, Silicon Valley");
    insertSetting.run("company_email", "support@mbiservice.com");
    insertSetting.run("company_phone", "+1 (555) 123-4567");
    insertSetting.run("announcement_text", "Welcome to MBI Service Center! Check out our new efficiency dashboard.");
    insertSetting.run("announcement_speed", "30");
    insertSetting.run("slideshow_images", JSON.stringify([
      {
        url: "https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&q=80&w=1200",
        title: "Precision in Every Repair.",
        caption: "Providing high-standard diagnostic and repair services for professional equipment."
      },
      {
        url: "https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?auto=format&fit=crop&q=80&w=1200",
        title: "Enterprise Solutions.",
        caption: "Expert support for specialized electronics and computer systems."
      },
      {
        url: "https://images.unsplash.com/photo-1517077304055-6e89abbf09b0?auto=format&fit=crop&q=80&w=1200",
        title: "Quality Guaranteed.",
        caption: "Our certified technicians ensure your gear is returned in top condition."
      }
    ]));
    insertSetting.run("app_version", "v2.4.0");
    insertSetting.run("copyright_text", "© 2026 MBI Service Center. All rights reserved.");
  }
};
// Seed local DB
seed();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes - Migration helper to move data from SQLite to Firebase
  app.post("/api/migrate-from-sqlite", async (req, res) => {
    try {
      console.log("Starting migration from SQLite to Firebase...");
      
      // 1. Users - Preserve username as doc ID
      const sqliteUsers = db.prepare("SELECT * FROM users").all() as any[];
      for (const u of sqliteUsers) {
        await adminDb.collection("users").doc(u.username).set({
          username: u.username,
          password: u.password,
          role: u.role,
          name: u.name,
          migrated_at: new Date().toISOString()
        }, { merge: true });
      }

      // 2. Brands
      const sqliteBrands = db.prepare("SELECT * FROM brands").all() as any[];
      const brandMap = new Map();
      for (const b of sqliteBrands) {
        const brandRef = await adminDb.collection("brands").add({
          name: b.name,
          migrated_at: new Date().toISOString()
        });
        brandMap.set(b.id, brandRef.id);
      }

      // 3. Settings
      const sqliteSettings = db.prepare("SELECT * FROM settings").all() as any[];
      for (const s of sqliteSettings) {
        await adminDb.collection("settings").doc(s.key).set({
          value: s.value,
          migrated_at: new Date().toISOString()
        }, { merge: true });
      }

      // 4. Parts
      const sqliteParts = db.prepare("SELECT * FROM parts").all() as any[];
      for (const p of sqliteParts) {
        await adminDb.collection("parts").add({
          part_number: p.part_number,
          name: p.name,
          price: p.price,
          cogs: p.cogs,
          migrated_at: new Date().toISOString()
        });
      }

      // 5. Service Requests
      const sqliteRequests = db.prepare("SELECT * FROM service_requests").all() as any[];
      for (const r of sqliteRequests) {
        const requestData = {
          customer_name: r.customer_name,
          customer_phone: r.customer_phone,
          customer_address: r.customer_address,
          brand_id: brandMap.get(r.brand_id) || r.brand_id,
          model: r.model,
          serial_number: r.serial_number,
          issue_description: r.issue_description,
          accessories: r.accessories,
          status: r.status,
          priority: r.priority,
          service_notes: r.service_notes,
          labor_charge: r.labor_charge,
          down_payment: r.down_payment,
          service_type: r.service_type,
          request_number: r.request_number,
          created_at: r.created_at,
          updated_at: r.updated_at,
          migrated_at: new Date().toISOString()
        };
        const reqDoc = await adminDb.collection("service_requests").add(requestData);

        // 6. Billing for this request
        const sqliteBilling = db.prepare("SELECT * FROM billing WHERE service_request_id = ?").get(r.id) as any;
        if (sqliteBilling) {
          await adminDb.collection("billing").add({
            service_request_id: reqDoc.id,
            service_fee: sqliteBilling.service_fee,
            total_amount: sqliteBilling.total_amount,
            status: sqliteBilling.status,
            invoice_number: sqliteBilling.invoice_number,
            created_at: sqliteBilling.created_at,
            migrated_at: new Date().toISOString()
          });
        }

        // 7. Service Logs for this request
        const sqliteLogs = db.prepare("SELECT l.*, u.username FROM service_log l LEFT JOIN users u ON l.technician_id = u.id WHERE service_request_id = ?").all(r.id) as any[];
        for (const log of sqliteLogs) {
          await adminDb.collection(`service_requests/${reqDoc.id}/logs`).add({
            note: log.note,
            technician_username: log.username,
            is_important: log.is_important === 1,
            is_responded: log.is_responded === 1,
            created_at: log.created_at,
            migrated_at: new Date().toISOString()
          });
        }
      }

      res.json({ success: true, message: "Migration completed successfully" });
    } catch (error: any) {
      console.error("Migration error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
