const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Connection
const dbPath = path.join(__dirname, 'sales.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to database:', err.message);
  } else {
    console.log('Connected to the SQLite sales database.');
  }
});

// App configuration (Tally connection and Mock Mode)
let TALLY_URL = process.env.TALLY_URL || 'http://localhost:9000';
let TALLY_MOCK_MODE = process.env.TALLY_MOCK_MODE !== 'false';
const TALLY_COMPANY_NAME = process.env.TALLY_COMPANY_NAME || 'Demo Company';
const MANAGER_EMAIL = process.env.MANAGER_EMAIL || 'manager@example.com';

// In-Memory Sessions
const SESSIONS = {};

// Helper to authenticate session token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token || !SESSIONS[token]) {
    return res.status(401).json({ error: 'Unauthorized, session expired or invalid' });
  }

  req.username = SESSIONS[token].username;
  req.role = SESSIONS[token].role;
  next();
}

// ----------------------------------------------------
// AUTH ENDPOINTS
// ----------------------------------------------------

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database query error' });
    }
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const passwordIsValid = bcrypt.compareSync(password, user.password_hash);
    if (!passwordIsValid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Generate random session token
    const token = crypto.randomBytes(32).toString('hex');
    SESSIONS[token] = { username: user.username, role: user.role };

    res.json({ token, username: user.username, role: user.role });
  });
});

app.post('/api/logout', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token && SESSIONS[token]) {
    delete SESSIONS[token];
  }
  res.json({ success: true, message: 'Logged out successfully' });
});

// ----------------------------------------------------
// TALLY MASTER DATA ENDPOINTS
// ----------------------------------------------------

app.get('/api/masters', authenticateToken, (req, res) => {
  db.all('SELECT * FROM parties ORDER BY name ASC', [], (err, parties) => {
    if (err) {
      return res.status(500).json({ error: 'Error fetching parties' });
    }
    db.all('SELECT * FROM items ORDER BY name ASC', [], (err2, items) => {
      if (err2) {
        return res.status(500).json({ error: 'Error fetching items' });
      }
      res.json({ parties, items });
    });
  });
});

// ----------------------------------------------------
// SETTINGS ENDPOINTS
// ----------------------------------------------------

app.get('/api/settings', authenticateToken, (req, res) => {
  res.json({ tally_url: TALLY_URL, mock_mode: TALLY_MOCK_MODE });
});

app.post('/api/settings', authenticateToken, (req, res) => {
  if (req.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can modify settings' });
  }

  const { tally_url, mock_mode } = req.body;
  if (tally_url !== undefined) TALLY_URL = tally_url;
  if (mock_mode !== undefined) TALLY_MOCK_MODE = !!mock_mode;

  res.json({ success: true, tally_url: TALLY_URL, mock_mode: TALLY_MOCK_MODE });
});

// State codes lookup for India GST
const STATE_CODES = {
  'tamil nadu': '33',
  'karnataka': '29',
  'kerala': '32',
  'maharashtra': '27',
  'delhi': '07',
  'andhra pradesh': '37',
  'telangana': '36',
  'gujarat': '24',
  'uttar pradesh': '09',
  'west bengal': '19',
  'haryana': '06',
  'punjab': '03',
  'rajasthan': '08',
  'madhya pradesh': '23',
  'bihar': '10',
  'assam': '18',
  'odisha': '21',
  'goa': '30'
};

// Sync Masters from Tally Prime
app.post('/api/settings/sync-masters', authenticateToken, async (req, res) => {
  if (req.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can sync masters' });
  }

  if (TALLY_MOCK_MODE) {
    // Populate extra mock production data for simulation testing
    db.serialize(() => {
      db.run('DELETE FROM parties');
      db.run('DELETE FROM items');

      const mockParties = [
        ['Rajesh Enterprises', '33AABCR1234A1Z1', 'Tamil Nadu', '33', '12, Gandhi Road, Chennai - 600001'],
        ['Venkateshwara Traders', '29AABCV5678B2Z2', 'Karnataka', '29', '45, Residency Road, Bangalore - 560025'],
        ['Priya Distributors', '32AABCP9012C3Z3', 'Kerala', '32', '78, MG Road, Ernakulam - 682011'],
        ['Kalyan Grocery Store', '33AAACK8765D1Z4', 'Tamil Nadu', '33', '56, Anna Salai, Trichy - 620002'],
        ['Murugan Agencies', '33AABCM9876E2Z5', 'Tamil Nadu', '33', '10, bypass Road, Madurai - 625016'],
        ['Balaji & Co', '33AABCB3456D1Z5', 'Tamil Nadu', '33', '102, Netaji Road, Madurai - 625001']
      ];

      const mockItems = [
        ['Basmati Rice Super', '10063020', 85.00, 'KG', 5],
        ['Refined Sunflower Oil 1L', '15121910', 140.00, 'LTR', 12],
        ['UltraTech Cement Grade 53', '25232940', 420.00, 'BAG', 28],
        ['Finolex Wire 1.5 sq mm 90m', '85444920', 1850.00, 'COIL', 18],
        ['LED Bulb 9W Syska', '85395200', 90.00, 'PCS', 18],
        ['Fortune Mustard Oil 1L', '15121910', 165.00, 'LTR', 12],
        ['Phillips LED Bulb 12W', '85395200', 130.00, 'PCS', 18],
        ['Tata Salt 1KG', '25010021', 25.00, 'KG', 0]
      ];

      const stmtParty = db.prepare('INSERT INTO parties (name, gstin, state, state_code, address) VALUES (?, ?, ?, ?, ?)');
      mockParties.forEach(p => stmtParty.run(p[0], p[1], p[2], p[3], p[4]));
      stmtParty.finalize();

      const stmtItem = db.prepare('INSERT INTO items (name, hsn_code, rate, unit, gst_rate) VALUES (?, ?, ?, ?, ?)');
      mockItems.forEach(i => stmtItem.run(i[0], i[1], i[2], i[3], i[4]));
      stmtItem.finalize();
    });

    return res.json({ success: true, partiesCount: 6, itemsCount: 8, message: 'Mock production masters seeded successfully' });
  }

  // Real Tally XML query
  try {
    const debtorQueryXML = `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>EXPORT</TALLYREQUEST>
        <TYPE>COLLECTION</TYPE>
        <ID>FetchSundryDebtors</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="FetchSundryDebtors" ISMODIFY="No" ISFIXED="No" ISINITIALIZE="No" ISOPTION="No" ISINTERNAL="No">
                <TYPE>Ledger</TYPE>
                <CHILDOF>Sundry Debtors</CHILDOF>
                <BELONGSTO>Yes</BELONGSTO>
                <NATIVEMETHOD>Name</NATIVEMETHOD>
                <NATIVEMETHOD>GSTRegistrationNumber</NATIVEMETHOD>
                <NATIVEMETHOD>StateName</NATIVEMETHOD>
              </COLLECTION>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;

    const stockQueryXML = `<ENVELOPE>
      <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>StockItemCollection</ID>
      </HEADER>
      <BODY>
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          </STATICVARIABLES>
          <TDL>
            <TDLMESSAGE>
              <COLLECTION NAME="StockItemCollection" ISINTERNAL="No">
                <TYPE>StockItem</TYPE>
                <FETCH>Name, BaseUnits, OpeningRate, GSTDetailsList, GSTDetails</FETCH>
              </COLLECTION>
            </TDLMESSAGE>
          </TDL>
        </DESC>
      </BODY>
    </ENVELOPE>`;

    console.log('Sending requests to Tally Prime...');
    const partiesXML = await queryTallyPromise(debtorQueryXML);
    const itemsXML = await queryTallyPromise(stockQueryXML);

    // Parse Parties
    const ledgerBlocks = partiesXML.match(/<LEDGER[\s\S]*?<\/LEDGER>/gi) || [];
    const parsedParties = [];
    ledgerBlocks.forEach(block => {
      const nameMatch = block.match(/<NAME[^>]*>([\s\S]*?)<\/NAME>/i);
      const name = nameMatch ? nameMatch[1].trim() : '';
      if (!name) return;

      const gstinMatch = block.match(/<GSTREGISTRATIONNUMBER[^>]*>([\s\S]*?)<\/GSTREGISTRATIONNUMBER>/i);
      const gstin = gstinMatch ? gstinMatch[1].trim() : '';

      const stateMatch = block.match(/<STATENAME[^>]*>([\s\S]*?)<\/STATENAME>/i);
      const state = stateMatch ? stateMatch[1].trim() : 'Tamil Nadu';

      const stateLower = state.toLowerCase();
      const state_code = STATE_CODES[stateLower] || '33';

      parsedParties.push([name, gstin, state, state_code, 'Imported from Tally Prime']);
    });

    // Parse Items
    const itemBlocks = itemsXML.match(/<STOCKITEM[\s\S]*?<\/STOCKITEM>/gi) || [];
    const parsedItems = [];
    itemBlocks.forEach(block => {
      const nameMatch = block.match(/<NAME[^>]*>([\s\S]*?)<\/NAME>/i);
      const name = nameMatch ? nameMatch[1].trim() : '';
      if (!name) return;

      const unitMatch = block.match(/<BASEUNITS[^>]*>([\s\S]*?)<\/BASEUNITS>/i);
      const unit = unitMatch ? unitMatch[1].trim() : 'PCS';

      const rateMatch = block.match(/<OPENINGRATE[^>]*>([\s\S]*?)<\/OPENINGRATE>/i);
      let rate = 0;
      if (rateMatch) {
        const cleanRateStr = rateMatch[1].split('/')[0].replace(/[^\d.]/g, '');
        rate = parseFloat(cleanRateStr) || 0;
      }

      const hsnMatch = block.match(/<HSNCODE[^>]*>([\s\S]*?)<\/HSNCODE>/i);
      const hsn_code = hsnMatch ? hsnMatch[1].trim() : '9963';

      const gstRateMatch = block.match(/<GSTRATE[^>]*>([\s\S]*?)<\/GSTRATE>/i);
      let gst_rate = 18;
      if (gstRateMatch) {
        gst_rate = parseFloat(gstRateMatch[1]) || 18;
      } else {
        const anyGstMatch = block.match(/<GSTRATEDETAILS\.LIST>[\s\S]*?<GSTRATE[^>]*>([\s\S]*?)<\/GSTRATE>/i);
        if (anyGstMatch) {
          gst_rate = parseFloat(anyGstMatch[1]) || 18;
        }
      }

      parsedItems.push([name, hsn_code, rate, unit, gst_rate]);
    });

    // Save to Database
    db.serialize(() => {
      db.run('DELETE FROM parties');
      db.run('DELETE FROM items');

      const stmtParty = db.prepare('INSERT INTO parties (name, gstin, state, state_code, address) VALUES (?, ?, ?, ?, ?)');
      parsedParties.forEach(p => stmtParty.run(p));
      stmtParty.finalize();

      const stmtItem = db.prepare('INSERT INTO items (name, hsn_code, rate, unit, gst_rate) VALUES (?, ?, ?, ?, ?)');
      parsedItems.forEach(i => stmtItem.run(i));
      stmtItem.finalize();
    });

    res.json({
      success: true,
      partiesCount: parsedParties.length,
      itemsCount: parsedItems.length,
      message: 'Masters synchronized successfully from Tally Prime!'
    });
  } catch (err) {
    console.error('Error syncing masters:', err.message);
    res.status(500).json({
      success: false,
      message: `Failed to connect to Tally Prime at ${TALLY_URL}. Ensure Tally is running and Allow XML requests is enabled. Error: ${err.message}`
    });
  }
});

function queryTallyPromise(xmlPayload) {
  return new Promise((resolve, reject) => {
    const url = new URL(TALLY_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        'Content-Length': Buffer.byteLength(xmlPayload)
      },
      timeout: 10000 // 10s timeout
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Tally connection timed out'));
    });

    req.on('error', (err) => reject(err));
    req.write(xmlPayload);
    req.end();
  });
}

// ----------------------------------------------------
// SALES VOUCHERS ENDPOINTS
// ----------------------------------------------------

// Submit a new voucher (requires approval, does not auto-sync)
app.post('/api/vouchers', authenticateToken, (req, res) => {
  const {
    voucher_date,
    party_id,
    party_name,
    items, // Array of { item_id, item_name, hsn_code, quantity, rate, unit, gst_rate, amount }
    subtotal,
    cgst,
    sgst,
    igst,
    total_amount
  } = req.body;

  if (!party_id || !party_name || !items || items.length === 0 || !total_amount) {
    return res.status(400).json({ error: 'Invalid voucher data' });
  }

  const items_json = JSON.stringify(items);
  const created_by = req.username;

  db.run(
    `INSERT INTO vouchers 
    (voucher_date, party_id, party_name, items_json, subtotal, cgst, sgst, igst, total_amount, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending Approval', ?)`,
    [voucher_date, party_id, party_name, items_json, subtotal, cgst, sgst, igst, total_amount, created_by],
    function (err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to save voucher in local DB: ' + err.message });
      }

      const voucherId = this.lastID;

      // Simulate Email Notification to Manager
      console.log(`\n========================================================================`);
      console.log(`[EMAIL NOTIFICATION SENT]`);
      console.log(`To: ${MANAGER_EMAIL}`);
      console.log(`Subject: [APPROVAL REQUIRED] New Sales Entry from ${created_by}`);
      console.log(`Details:`);
      console.log(`  Salesman: ${created_by}`);
      console.log(`  Customer: ${party_name}`);
      console.log(`  Voucher Date: ${voucher_date}`);
      console.log(`  Grand Total: ₹${total_amount.toFixed(2)}`);
      console.log(`  Items: ${items.map(i => `${i.item_name} (x${i.quantity})`).join(', ')}`);
      console.log(`Action Link: Log in to local dashboard at http://localhost:3000 to approve.`);
      console.log(`========================================================================\n`);

      res.json({
        success: true,
        voucher_id: voucherId,
        status: 'Pending Approval',
        message: 'Voucher saved locally and submitted to manager for approval.'
      });
    }
  );
});

// List all vouchers
app.get('/api/vouchers', authenticateToken, (req, res) => {
  db.all('SELECT * FROM vouchers ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Error fetching vouchers' });
    }
    // Parse items_json
    const vouchers = rows.map(row => ({
      ...row,
      items: JSON.parse(row.items_json)
    }));
    res.json(vouchers);
  });
});

// Admin Approve & Sync with Tally
app.post('/api/vouchers/approve/:id', authenticateToken, (req, res) => {
  if (req.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins/managers can approve vouchers' });
  }

  const voucherId = req.params.id;
  syncVoucherToTally(voucherId, (syncResult) => {
    res.json(syncResult);
  });
});

// Admin Reject Voucher
app.post('/api/vouchers/reject/:id', authenticateToken, (req, res) => {
  if (req.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins/managers can reject vouchers' });
  }

  const voucherId = req.params.id;
  db.run(
    'UPDATE vouchers SET status = "Rejected" WHERE id = ?',
    [voucherId],
    (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to reject voucher: ' + err.message });
      }
      res.json({ success: true, status: 'Rejected', message: 'Voucher rejected by manager.' });
    }
  );
});

// ----------------------------------------------------
// TALLY INTEGRATION SYNC SERVICE
// ----------------------------------------------------

function syncVoucherToTally(voucherId, callback) {
  db.get('SELECT * FROM vouchers WHERE id = ?', [voucherId], (err, voucher) => {
    if (err || !voucher) {
      return callback({ status: 'Failed', message: 'Voucher not found in DB' });
    }

    if (TALLY_MOCK_MODE) {
      // Simulate Tally sync with 800ms network delay
      setTimeout(() => {
        const mockVoucherNo = `TLY-INV-2627-${String(voucherId).padStart(4, '0')}`;
        const mockResponse = `<ENVELOPE><HEADER><LINEERROR>0</LINEERROR></HEADER><BODY><DATA><CREATED>1</CREATED><ERRORS>0</ERRORS></DATA></BODY></ENVELOPE>`;
        
        db.run(
          'UPDATE vouchers SET status = "Synced", tally_voucher_no = ?, tally_response = ? WHERE id = ?',
          [mockVoucherNo, mockResponse, voucherId],
          (updateErr) => {
            if (updateErr) {
              callback({ status: 'Failed', message: 'Failed to update local status: ' + updateErr.message });
            } else {
              callback({
                status: 'Synced',
                voucher_no: mockVoucherNo,
                message: 'Voucher synced successfully to Tally (Mock Mode)'
              });
            }
          }
        );
      }, 800);
      return;
    }

    // Real Tally XML integration
    const items = JSON.parse(voucher.items_json);
    const xmlPayload = generateTallyXML(voucher, items);

    // Make local HTTP Request to Tally Prime
    const url = new URL(TALLY_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        'Content-Length': Buffer.byteLength(xmlPayload)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log('Tally Response:', data);
        
        // Parse basic Tally XML response
        const hasErrors = data.includes('<ERRORS>') && !data.includes('<ERRORS>0</ERRORS>');
        const created = data.includes('<CREATED>1</CREATED>') || data.includes('<CREATED>2</CREATED>');
        
        if (created && !hasErrors) {
          const tallyVchNo = `TLY-INV-2627-${String(voucherId).padStart(4, '0')}`; // Usually Tally auto-assigns, we track with local ref
          db.run(
            'UPDATE vouchers SET status = "Synced", tally_voucher_no = ?, tally_response = ? WHERE id = ?',
            [tallyVchNo, data, voucherId],
            () => {
              callback({ status: 'Synced', voucher_no: tallyVchNo, message: 'Successfully synced to Tally Prime!' });
            }
          );
        } else {
          // Extract error message from Tally response if possible
          const errorMsg = 'Import error in Tally. Check Tally.imp log file.';
          db.run(
            'UPDATE vouchers SET status = "Failed", tally_response = ? WHERE id = ?',
            [data || errorMsg, voucherId],
            () => {
              callback({ status: 'Failed', message: errorMsg, response: data });
            }
          );
        }
      });
    });

    req.on('error', (reqErr) => {
      console.error('Tally Connection Error:', reqErr.message);
      db.run(
        'UPDATE vouchers SET status = "Failed", tally_response = ? WHERE id = ?',
        [`Connection error: ${reqErr.message}. Ensure Tally is running and Allow XML requests is enabled on ${TALLY_URL}.`, voucherId],
        () => {
          callback({
            status: 'Failed',
            message: `Connection failed to Tally Prime. Check if Tally is running on ${TALLY_URL} and settings are correct.`
          });
        }
      );
    });

    req.write(xmlPayload);
    req.end();
  });
}

// Generate valid Tally XML with inventory details & GST Ledgers
function generateTallyXML(voucher, items) {
  // Format Date from YYYY-MM-DD to YYYYMMDD
  const cleanDate = voucher.voucher_date.replace(/-/g, '');

  let xml = `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${TALLY_COMPANY_NAME}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Invoice Voucher View">
            <DATE>${cleanDate}</DATE>
            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
            <PARTYLEDGERNAME>${voucher.party_name}</PARTYLEDGERNAME>
            <EFFECTIVEDATE>${cleanDate}</EFFECTIVEDATE>
            <ISINVOICE>Yes</ISINVOICE>
            
            <!-- PARTY LEDGER ENTRY (DEBIT) -->
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>${voucher.party_name}</LEDGERNAME>
              <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${voucher.total_amount.toFixed(2)}</AMOUNT>
            </LEDGERENTRIES.LIST>
  `;

  // INVENTORY ENTRIES (CREDIT & STOCK ALLOCATIONS)
  items.forEach(item => {
    const itemTotal = item.rate * item.quantity;
    xml += `
            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>${item.item_name}</STOCKITEMNAME>
              <RATE>${item.rate.toFixed(2)}/${item.unit}</RATE>
              <AMOUNT>${itemTotal.toFixed(2)}</AMOUNT>
              <ACTUALQTY> ${item.quantity} ${item.unit}</ACTUALQTY>
              <BILLEDQTY> ${item.quantity} ${item.unit}</BILLEDQTY>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              
              <BATCHALLOCATIONS.LIST>
                <GODOWNNAME>Main Location</GODOWNNAME>
                <BATCHNAME>Primary Batch</BATCHNAME>
                <AMOUNT>${itemTotal.toFixed(2)}</AMOUNT>
                <ACTUALQTY> ${item.quantity} ${item.unit}</ACTUALQTY>
                <BILLEDQTY> ${item.quantity} ${item.unit}</BILLEDQTY>
              </BATCHALLOCATIONS.LIST>
              
              <ACCOUNTINGALLOCATIONS.LIST>
                <LEDGERNAME>Sales Account</LEDGERNAME>
                <AMOUNT>${itemTotal.toFixed(2)}</AMOUNT>
                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              </ACCOUNTINGALLOCATIONS.LIST>
            </ALLINVENTORYENTRIES.LIST>
    `;
  });

  // GST TAX LEDGERS (CREDIT)
  if (voucher.cgst > 0) {
    xml += `
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>CGST</LEDGERNAME>
              <ISPARTYLEDGER>No</ISPARTYLEDGER>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${voucher.cgst.toFixed(2)}</AMOUNT>
            </LEDGERENTRIES.LIST>
    `;
  }
  if (voucher.sgst > 0) {
    xml += `
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>SGST</LEDGERNAME>
              <ISPARTYLEDGER>No</ISPARTYLEDGER>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${voucher.sgst.toFixed(2)}</AMOUNT>
            </LEDGERENTRIES.LIST>
    `;
  }
  if (voucher.igst > 0) {
    xml += `
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>IGST</LEDGERNAME>
              <ISPARTYLEDGER>No</ISPARTYLEDGER>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${voucher.igst.toFixed(2)}</AMOUNT>
            </LEDGERENTRIES.LIST>
    `;
  }

  xml += `
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

  return xml;
}

app.listen(PORT, () => {
  console.log(`Server running locally on http://localhost:${PORT}`);
  console.log(`Tally sync mode: ${TALLY_MOCK_MODE ? 'MOCK MODE ENABLED' : 'REAL SYNC (URL: ' + TALLY_URL + ')'}`);
});
