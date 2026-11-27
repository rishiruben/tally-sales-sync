const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(__dirname, 'sales.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  console.log('Initializing database schema...');

  // Create Users Table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'salesman'
    )
  `);

  // Create Parties (Customers) Table
  db.run(`
    CREATE TABLE IF NOT EXISTS parties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      gstin TEXT,
      state TEXT NOT NULL,
      state_code TEXT NOT NULL,
      address TEXT
    )
  `);

  // Create Stock Items Table
  db.run(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      hsn_code TEXT NOT NULL,
      rate REAL NOT NULL,
      unit TEXT NOT NULL,
      gst_rate REAL NOT NULL -- e.g., 18 for 18%
    )
  `);

  // Create Vouchers Table
  // Storing items details as JSON string for simplicity, can also be a separate item relation table, 
  // but a JSON string is extremely clean for SQLite in lightweight mobile sync.
  db.run(`
    CREATE TABLE IF NOT EXISTS vouchers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voucher_date TEXT NOT NULL,
      party_id INTEGER NOT NULL,
      party_name TEXT NOT NULL,
      items_json TEXT NOT NULL,
      subtotal REAL NOT NULL,
      cgst REAL NOT NULL,
      sgst REAL NOT NULL,
      igst REAL NOT NULL,
      total_amount REAL NOT NULL,
      status TEXT DEFAULT 'Pending', -- Pending, Synced, Failed
      tally_voucher_no TEXT,
      tally_response TEXT,
      created_by TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (party_id) REFERENCES parties(id)
    )
  `);

  console.log('Seeding initial data...');

  // Seed Users
  const salt = bcrypt.genSaltSync(10);
  const salesman1Hash = bcrypt.hashSync('sales123', salt);
  const salesman2Hash = bcrypt.hashSync('sales456', salt);
  const adminHash = bcrypt.hashSync('admin123', salt);

  const stmtUser = db.prepare('INSERT OR REPLACE INTO users (username, password_hash, role) VALUES (?, ?, ?)');
  stmtUser.run('salesman1', salesman1Hash, 'salesman');
  stmtUser.run('salesman2', salesman2Hash, 'salesman');
  stmtUser.run('admin', adminHash, 'admin');
  stmtUser.finalize();

  // Seed Parties (Mock Indian customers with states/GSTINs)
  const partiesData = [
    ['Rajesh Enterprises', '33AABCR1234A1Z1', 'Tamil Nadu', '33', '12, Gandhi Road, Chennai - 600001'],
    ['Venkateshwara Traders', '29AABCV5678B2Z2', 'Karnataka', '29', '45, Residency Road, Bangalore - 560025'],
    ['Priya Distributors', '32AABCP9012C3Z3', 'Kerala', '32', '78, MG Road, Ernakulam - 682011'],
    ['Metro Cash Retailers', '', 'Tamil Nadu', '33', 'Direct cash customer - Chennai'],
    ['Balaji & Co', '33AABCB3456D1Z5', 'Tamil Nadu', '33', '102, Netaji Road, Madurai - 625001']
  ];

  const stmtParty = db.prepare('INSERT INTO parties (name, gstin, state, state_code, address) VALUES (?, ?, ?, ?, ?)');
  partiesData.forEach(p => stmtParty.run(p[0], p[1], p[2], p[3], p[4]));
  stmtParty.finalize();

  // Seed Stock Items (Mock inventory list)
  const itemsData = [
    ['Basmati Rice Super', '10063020', 85.00, 'KG', 5],
    ['Refined Sunflower Oil 1L', '15121910', 140.00, 'LTR', 12],
    ['UltraTech Cement Grade 53', '25232940', 420.00, 'BAG', 28],
    ['Finolex Wire 1.5 sq mm 90m', '85444920', 1850.00, 'COIL', 18],
    ['LED Bulb 9W Syska', '85395200', 90.00, 'PCS', 18],
    ['Tata Salt 1KG', '25010021', 25.00, 'KG', 0]
  ];

  const stmtItem = db.prepare('INSERT INTO items (name, hsn_code, rate, unit, gst_rate) VALUES (?, ?, ?, ?, ?)');
  itemsData.forEach(i => stmtItem.run(i[0], i[1], i[2], i[3], i[4]));
  stmtItem.finalize();

  console.log('Seeding completed successfully!');
});

db.close();
