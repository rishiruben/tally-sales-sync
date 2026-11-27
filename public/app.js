// ====================================================
// TALLY SALES SYNC - PORTAL CLIENT LOGIC (public/app.js)
// ====================================================

// Application State
let TOKEN = localStorage.getItem('tally_sync_token') || '';
let USERNAME = localStorage.getItem('pr_username') || '';
let ROLE = localStorage.getItem('pr_role') || '';

let PARTIES = [];
let ITEMS = [];
let CART = [];
let SELECTED_PARTY = null;
let SELECTED_ITEM = null;

// Local office state code (Tamil Nadu is 33)
const LOCAL_STATE_CODE = '33';

// DOM Elements
const loginContainer = document.getElementById('login-container');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const loginUsernameInput = document.getElementById('login-username');
const loginPasswordInput = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const userGreeting = document.getElementById('user-greeting');
const btnLogout = document.getElementById('btn-logout');

const partySearch = document.getElementById('party-search');
const partyResults = document.getElementById('party-results');
const partyInfoBox = document.getElementById('party-info-box');
const infoPartyName = document.getElementById('info-party-name');
const infoPartyGstin = document.getElementById('info-party-gstin');
const infoPartyState = document.getElementById('info-party-state');

const itemSearch = document.getElementById('item-search');
const itemResults = document.getElementById('item-results');
const itemQty = document.getElementById('item-qty');
const itemRate = document.getElementById('item-rate');
const unitLabel = document.getElementById('unit-label');
const btnAddItem = document.getElementById('btn-add-item');
const itemError = document.getElementById('item-error');

const cartTable = document.getElementById('cart-table');
const cartTbody = document.getElementById('cart-tbody');
const summaryPartyName = document.getElementById('summary-party-name');
const summaryGstClass = document.getElementById('summary-gst-class');
const summarySubtotal = document.getElementById('summary-subtotal');
const summaryCgst = document.getElementById('summary-cgst');
const summarySgst = document.getElementById('summary-sgst');
const summaryIgst = document.getElementById('summary-igst');
const summaryTotal = document.getElementById('summary-total');
const btnSubmitVoucher = document.getElementById('btn-submit-voucher');
const voucherDateInput = document.getElementById('voucher-date');

const vouchersTbody = document.getElementById('vouchers-tbody');
const btnRefreshVouchers = document.getElementById('btn-refresh-vouchers');

const adminPanel = document.getElementById('admin-panel');
const settingTallyUrl = document.getElementById('setting-tally-url');
const settingMockMode = document.getElementById('setting-mock-mode');
const btnSaveSettings = document.getElementById('btn-save-settings');
const connectionStatus = document.getElementById('connection-status');

// Status Dialog elements
const statusDialog = document.getElementById('status-dialog');
const dialogTitle = document.getElementById('dialog-title');
const dialogLoader = document.getElementById('dialog-loader');
const dialogMessage = document.getElementById('dialog-message');
const dialogCloseBtn = document.getElementById('dialog-close-btn');

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  // Set default voucher date to today
  const today = new Date().toISOString().split('T')[0];
  voucherDateInput.value = today;

  if (TOKEN) {
    showApp();
  } else {
    showLogin();
  }
});

// Helper Headers
function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${TOKEN}`
  };
}

// ----------------------------------------------------
// ROUTING / VIEW SWITCHER
// ----------------------------------------------------

function showLogin() {
  appContainer.classList.remove('active');
  loginContainer.classList.add('active');
  loginUsernameInput.focus();
}

function showApp() {
  loginContainer.classList.remove('active');
  appContainer.classList.add('active');
  userGreeting.textContent = `Welcome, ${USERNAME}`;

  if (ROLE === 'admin') {
    adminPanel.classList.remove('hidden');
  } else {
    adminPanel.classList.add('hidden');
  }

  fetchSettings();
  fetchMasters();
  fetchVouchers();
}

// ----------------------------------------------------
// LOGIN & LOGOUT LOGIC
// ----------------------------------------------------

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');
  
  const username = loginUsernameInput.value.trim();
  const password = loginPasswordInput.value;

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }

    // Save details
    TOKEN = data.token;
    USERNAME = data.username;
    ROLE = data.role;
    localStorage.setItem('tally_sync_token', TOKEN);
    localStorage.setItem('pr_username', USERNAME);
    localStorage.setItem('pr_role', ROLE);

    showApp();
  } catch (err) {
    loginError.textContent = err.message;
    loginError.classList.remove('hidden');
  }
});

btnLogout.addEventListener('click', async () => {
  try {
    await fetch('/api/logout', {
      method: 'POST',
      headers: getHeaders()
    });
  } catch (e) {
    console.error('Logout error', e);
  }
  
  // Clear session
  TOKEN = '';
  USERNAME = '';
  ROLE = '';
  localStorage.removeItem('tally_sync_token');
  localStorage.removeItem('pr_username');
  localStorage.removeItem('pr_role');
  
  // Clear local state
  CART = [];
  SELECTED_PARTY = null;
  SELECTED_ITEM = null;
  updateCartUI();
  partySearch.value = '';
  partyInfoBox.classList.add('hidden');
  itemSearch.value = '';
  
  showLogin();
});

// ----------------------------------------------------
// FETCH MASTERS & SETTINGS
// ----------------------------------------------------

async function fetchSettings() {
  try {
    const res = await fetch('/api/settings', { headers: getHeaders() });
    if (res.status === 401) return handleSessionExpired();
    const data = await res.json();
    
    settingTallyUrl.value = data.tally_url;
    settingMockMode.checked = data.mock_mode;
    
    if (data.mock_mode) {
      connectionStatus.textContent = 'Mock Sync (Local DB Seeding Only)';
      connectionStatus.className = 'badge badge-warning';
    } else {
      connectionStatus.textContent = 'Connected: Tally Prime';
      connectionStatus.className = 'badge badge-success';
    }
  } catch (err) {
    console.error('Error fetching settings:', err);
  }
}

async function fetchMasters() {
  try {
    const res = await fetch('/api/masters', { headers: getHeaders() });
    if (res.status === 401) return handleSessionExpired();
    const data = await res.json();
    PARTIES = data.parties;
    ITEMS = data.items;
  } catch (err) {
    console.error('Error fetching masters:', err);
  }
}

btnSaveSettings.addEventListener('click', async () => {
  const tally_url = settingTallyUrl.value.trim();
  const mock_mode = settingMockMode.checked;

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ tally_url, mock_mode })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('Settings saved successfully!');
    fetchSettings();
  } catch (err) {
    alert('Failed to save settings: ' + err.message);
  }
});

const btnSyncMasters = document.getElementById('btn-sync-masters');
btnSyncMasters.addEventListener('click', async () => {
  dialogTitle.textContent = 'Syncing Masters...';
  dialogMessage.textContent = 'Fetching Sundry Debtors and Stock Items from Tally Prime...';
  dialogLoader.classList.remove('hidden');
  dialogCloseBtn.classList.add('hidden');
  statusDialog.showModal();

  try {
    const res = await fetch('/api/settings/sync-masters', {
      method: 'POST',
      headers: getHeaders()
    });

    if (res.status === 401) {
      statusDialog.close();
      return handleSessionExpired();
    }

    const data = await res.json();
    dialogLoader.classList.add('hidden');
    dialogCloseBtn.classList.remove('hidden');

    if (res.ok && data.success) {
      dialogTitle.textContent = 'Sync Success!';
      dialogMessage.innerHTML = `Successfully loaded from Tally Prime:<br><br>👥 <strong>Customers (Parties)</strong>: ${data.partiesCount}<br>📦 <strong>Stock Items</strong>: ${data.itemsCount}`;
      fetchMasters(); // Refresh dropdown lists
    } else {
      dialogTitle.textContent = 'Sync Failed';
      dialogMessage.innerHTML = `Error pulling data: <span style="color:var(--danger)">${escapeHtml(data.message || 'Unknown error')}</span>`;
    }
  } catch (err) {
    dialogLoader.classList.add('hidden');
    dialogCloseBtn.classList.remove('hidden');
    dialogTitle.textContent = 'Connection Error';
    dialogMessage.innerHTML = `Error contacting sync server: <span style="color:var(--danger)">${escapeHtml(err.message)}</span>`;
  }
});

let IS_LOGGING_OUT = false;

function handleSessionExpired() {
  if (IS_LOGGING_OUT) return;
  IS_LOGGING_OUT = true;

  alert('Session expired. Please log in again.');

  // Clear session variables
  TOKEN = '';
  USERNAME = '';
  ROLE = '';
  localStorage.removeItem('tally_sync_token');
  localStorage.removeItem('pr_username');
  localStorage.removeItem('pr_role');

  // Clear local UI state
  CART = [];
  SELECTED_PARTY = null;
  SELECTED_ITEM = null;
  updateCartUI();
  partySearch.value = '';
  partyInfoBox.classList.add('hidden');
  itemSearch.value = '';

  showLogin();
  
  // Release lock after view switches
  setTimeout(() => {
    IS_LOGGING_OUT = false;
  }, 500);
}

// ----------------------------------------------------
// AUTOCOMPLETE FIELDS
// ----------------------------------------------------

// 1. Party (Customer) Autocomplete
partySearch.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase().trim();
  partyResults.innerHTML = '';
  
  if (!query) {
    partyResults.classList.add('hidden');
    return;
  }

  const filtered = PARTIES.filter(p => 
    p.name.toLowerCase().includes(query) || 
    (p.gstin && p.gstin.toLowerCase().includes(query))
  );

  if (filtered.length === 0) {
    partyResults.classList.add('hidden');
    return;
  }

  filtered.forEach(p => {
    const div = document.createElement('div');
    div.className = 'autocomplete-item';
    div.innerHTML = `
      <span>${escapeHtml(p.name)}</span>
      <span class="detail">${p.gstin ? escapeHtml(p.gstin) : 'Unregistered'} (${escapeHtml(p.state)})</span>
    `;
    div.addEventListener('click', () => selectParty(p));
    partyResults.appendChild(div);
  });

  partyResults.classList.remove('hidden');
});

// Close lists when clicking outside
document.addEventListener('click', (e) => {
  if (!partySearch.contains(e.target) && !partyResults.contains(e.target)) {
    partyResults.classList.add('hidden');
  }
  if (!itemSearch.contains(e.target) && !itemResults.contains(e.target)) {
    itemResults.classList.add('hidden');
  }
});

function selectParty(party) {
  SELECTED_PARTY = party;
  partySearch.value = party.name;
  partyResults.classList.add('hidden');

  // Show Party Info Card
  infoPartyName.textContent = party.name;
  infoPartyGstin.textContent = party.gstin || 'Unregistered (B2C Cash)';
  infoPartyState.textContent = `${party.state} (Code: ${party.state_code})`;
  partyInfoBox.classList.remove('hidden');

  // Update Summary Preview
  summaryPartyName.textContent = party.name;
  summaryPartyName.classList.remove('placeholder-text');

  // Check GST Type (Intrastate vs Interstate)
  const isLocal = party.state_code === LOCAL_STATE_CODE;
  summaryGstClass.textContent = isLocal ? 'CGST / SGST (Intrastate)' : 'IGST (Interstate)';
  summaryGstClass.classList.remove('placeholder-text');

  updateCartUI(); // Recalculate taxes based on the new party state
}

// 2. Stock Item Autocomplete
itemSearch.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase().trim();
  itemResults.innerHTML = '';

  if (!query) {
    itemResults.classList.add('hidden');
    return;
  }

  const filtered = ITEMS.filter(i => 
    i.name.toLowerCase().includes(query) || 
    i.hsn_code.includes(query)
  );

  if (filtered.length === 0) {
    itemResults.classList.add('hidden');
    return;
  }

  filtered.forEach(i => {
    const div = document.createElement('div');
    div.className = 'autocomplete-item';
    div.innerHTML = `
      <span>${escapeHtml(i.name)}</span>
      <span class="detail">₹${i.rate.toFixed(2)} / ${escapeHtml(i.unit)} (HSN: ${escapeHtml(i.hsn_code)})</span>
    `;
    div.addEventListener('click', () => selectItem(i));
    itemResults.appendChild(div);
  });

  itemResults.classList.remove('hidden');
});

function selectItem(item) {
  SELECTED_ITEM = item;
  itemSearch.value = item.name;
  itemResults.classList.add('hidden');

  unitLabel.textContent = item.unit;
  itemRate.value = item.rate.toFixed(2);
  itemQty.value = 1;
  itemQty.focus();
}

// ----------------------------------------------------
// VOUCHER CART ACTIONS & TAX CALCULATIONS
// ----------------------------------------------------

btnAddItem.addEventListener('click', () => {
  itemError.classList.add('hidden');

  if (!SELECTED_ITEM) {
    showItemError('Please select an item from the search dropdown.');
    return;
  }

  const qty = parseFloat(itemQty.value);
  const rate = parseFloat(itemRate.value);

  if (isNaN(qty) || qty <= 0) {
    showItemError('Please enter a valid quantity greater than zero.');
    return;
  }

  if (isNaN(rate) || rate < 0) {
    showItemError('Please enter a valid rate.');
    return;
  }

  // Check if item already in cart, update quantity if so
  const existingIndex = CART.findIndex(c => c.item_id === SELECTED_ITEM.id);
  if (existingIndex > -1) {
    CART[existingIndex].quantity += qty;
    CART[existingIndex].amount = CART[existingIndex].quantity * rate;
  } else {
    CART.push({
      item_id: SELECTED_ITEM.id,
      item_name: SELECTED_ITEM.name,
      hsn_code: SELECTED_ITEM.hsn_code,
      quantity: qty,
      rate: rate,
      unit: SELECTED_ITEM.unit,
      gst_rate: SELECTED_ITEM.gst_rate,
      amount: qty * rate
    });
  }

  // Reset item inputs
  SELECTED_ITEM = null;
  itemSearch.value = '';
  itemQty.value = '';
  itemRate.value = '';
  unitLabel.textContent = 'UNIT';

  updateCartUI();
});

function showItemError(msg) {
  itemError.textContent = msg;
  itemError.classList.remove('hidden');
}

function removeFromCart(index) {
  CART.splice(index, 1);
  updateCartUI();
}

function updateCartUI() {
  cartTbody.innerHTML = '';

  if (CART.length === 0) {
    cartTbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="7">No items added to voucher yet.</td>
      </tr>
    `;
    resetSummary();
    return;
  }

  CART.forEach((c, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(c.item_name)}</td>
      <td>${escapeHtml(c.hsn_code)}</td>
      <td>${c.quantity} ${escapeHtml(c.unit)}</td>
      <td>₹${c.rate.toFixed(2)}</td>
      <td>₹${c.amount.toFixed(2)}</td>
      <td>${c.gst_rate}%</td>
      <td>
        <button type="button" class="btn-delete" onclick="removeFromCart(${index})">✕</button>
      </td>
    `;
    cartTbody.appendChild(tr);
  });

  // Calculate bill and tax summary
  let subtotal = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;
  let igstTotal = 0;

  const isLocal = SELECTED_PARTY ? SELECTED_PARTY.state_code === LOCAL_STATE_CODE : true;

  CART.forEach(c => {
    subtotal += c.amount;
    const tax = c.amount * (c.gst_rate / 100);
    if (isLocal) {
      cgstTotal += tax / 2;
      sgstTotal += tax / 2;
    } else {
      igstTotal += tax;
    }
  });

  const grandTotal = subtotal + cgstTotal + sgstTotal + igstTotal;

  summarySubtotal.textContent = `₹${subtotal.toFixed(2)}`;
  
  const cgstRow = document.querySelector('.cgst-row');
  const sgstRow = document.querySelector('.sgst-row');
  const igstRow = document.querySelector('.igst-row');

  if (isLocal) {
    summaryCgst.textContent = `₹${cgstTotal.toFixed(2)}`;
    summarySgst.textContent = `₹${sgstTotal.toFixed(2)}`;
    cgstRow.classList.remove('hidden');
    sgstRow.classList.remove('hidden');
    igstRow.classList.add('hidden');
  } else {
    summaryIgst.textContent = `₹${igstTotal.toFixed(2)}`;
    igstRow.classList.remove('hidden');
    cgstRow.classList.add('hidden');
    sgstRow.classList.add('hidden');
  }

  summaryTotal.textContent = `₹${grandTotal.toFixed(2)}`;

  // Enable/Disable submit button
  if (SELECTED_PARTY && CART.length > 0) {
    btnSubmitVoucher.disabled = false;
  } else {
    btnSubmitVoucher.disabled = true;
  }
}

function resetSummary() {
  summarySubtotal.textContent = '₹0.00';
  summaryCgst.textContent = '₹0.00';
  summarySgst.textContent = '₹0.00';
  summaryIgst.textContent = '₹0.00';
  summaryTotal.textContent = '₹0.00';
  btnSubmitVoucher.disabled = true;

  document.querySelector('.cgst-row').classList.add('hidden');
  document.querySelector('.sgst-row').classList.add('hidden');
  document.querySelector('.igst-row').classList.add('hidden');
}

// ----------------------------------------------------
// VOUCHER SUBMISSION & TALLY SYNC
// ----------------------------------------------------

// Submit voucher (saves locally, status 'Pending Approval', notifies manager)
btnSubmitVoucher.addEventListener('click', async () => {
  if (!SELECTED_PARTY || CART.length === 0) return;

  const date = voucherDateInput.value;
  if (!date) {
    alert('Please select a valid date.');
    return;
  }

  // Calculate taxes
  let subtotal = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  const isLocal = SELECTED_PARTY.state_code === LOCAL_STATE_CODE;

  CART.forEach(c => {
    subtotal += c.amount;
    const tax = c.amount * (c.gst_rate / 100);
    if (isLocal) {
      cgst += tax / 2;
      sgst += tax / 2;
    } else {
      igst += tax;
    }
  });
  const total_amount = subtotal + cgst + sgst + igst;

  // Show status popup loader
  dialogTitle.textContent = 'Submitting...';
  dialogMessage.textContent = 'Saving sales entry locally and notifying manager...';
  dialogLoader.classList.remove('hidden');
  dialogCloseBtn.classList.add('hidden');
  statusDialog.showModal();

  try {
    const res = await fetch('/api/vouchers', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        voucher_date: date,
        party_id: SELECTED_PARTY.id,
        party_name: SELECTED_PARTY.name,
        items: CART,
        subtotal,
        cgst,
        sgst,
        igst,
        total_amount
      })
    });

    if (res.status === 401) {
      statusDialog.close();
      return handleSessionExpired();
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Submission failed');

    dialogLoader.classList.add('hidden');
    dialogCloseBtn.classList.remove('hidden');

    dialogTitle.textContent = 'Submitted!';
    dialogMessage.innerHTML = `Sales entry saved locally & submitted for approval.<br><br><strong>Voucher Status:</strong> Pending Manager Review.`;
    
    // Clear Cart
    CART = [];
    SELECTED_PARTY = null;
    partySearch.value = '';
    partyInfoBox.classList.add('hidden');
    summaryPartyName.textContent = 'None Selected';
    summaryPartyName.classList.add('placeholder-text');
    summaryGstClass.textContent = 'N/A';
    summaryGstClass.classList.add('placeholder-text');
    updateCartUI();

    fetchVouchers(); // Refresh day book
  } catch (err) {
    dialogLoader.classList.add('hidden');
    dialogCloseBtn.classList.remove('hidden');
    dialogTitle.textContent = 'Submission Error';
    dialogMessage.innerHTML = `Failed to submit sales entry:<br><span style="color:var(--danger)">${escapeHtml(err.message)}</span>`;
  }
});

// ----------------------------------------------------
// DAY BOOK READ & LOGS
// ----------------------------------------------------

async function fetchVouchers() {
  try {
    const res = await fetch('/api/vouchers', { headers: getHeaders() });
    if (res.status === 401) return handleSessionExpired();
    const vouchers = await res.json();

    vouchersTbody.innerHTML = '';
    if (vouchers.length === 0) {
      vouchersTbody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align: center; color: var(--text-muted);">No entries in the Day Book today.</td>
        </tr>
      `;
      return;
    }

    vouchers.forEach(v => {
      const itemSummaries = v.items.map(i => `${i.item_name} (${i.quantity} ${i.unit})`).join(', ');
      const totalGst = v.cgst + v.sgst + v.igst;
      
      let statusBadge = '';
      if (v.status === 'Synced') {
        statusBadge = `<span class="badge badge-success">Synced</span>`;
      } else if (v.status === 'Failed') {
        statusBadge = `<span class="badge badge-danger">Failed</span>`;
      } else if (v.status === 'Rejected') {
        statusBadge = `<span class="badge badge-danger" style="background:rgba(239,68,68,0.15); border-color:rgba(239,68,68,0.3)">Rejected</span>`;
      } else {
        statusBadge = `<span class="badge badge-warning">Pending Approval</span>`;
      }

      // Action buttons
      let actions = '';
      if (ROLE === 'admin') {
        if (v.status === 'Pending Approval') {
          actions = `
            <div style="display:flex; gap:6px;">
              <button class="btn btn-primary btn-sm" onclick="approveVoucher(${v.id})" style="background:var(--success); box-shadow:none; padding:4px 8px;">Approve</button>
              <button class="btn btn-secondary btn-sm" onclick="rejectVoucher(${v.id})" style="color:var(--danger); border-color:var(--danger); padding:4px 8px;">Reject</button>
            </div>
          `;
        } else if (v.status === 'Failed') {
          actions = `<button class="btn btn-primary btn-sm" onclick="approveVoucher(${v.id})" style="box-shadow:none; padding:4px 8px;">Retry Sync</button>`;
        } else {
          actions = `<span style="color:var(--text-muted); font-size:12px;">No Actions</span>`;
        }
      } else {
        // Salesman view
        if (v.status === 'Pending Approval') {
          actions = `<span style="color:var(--warning); font-size:12px; font-weight:500;">Awaiting Review</span>`;
        } else {
          actions = `<span style="color:var(--text-muted); font-size:12px;">No Actions</span>`;
        }
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${formatUIDate(v.voucher_date)}</td>
        <td><strong>${escapeHtml(v.party_name)}</strong></td>
        <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(itemSummaries)}">
          ${escapeHtml(itemSummaries)}
        </td>
        <td>₹${v.subtotal.toFixed(2)}</td>
        <td>₹${totalGst.toFixed(2)}</td>
        <td><strong>₹${v.total_amount.toFixed(2)}</strong></td>
        <td>${escapeHtml(v.created_by)}</td>
        <td>${statusBadge}</td>
        <td><code>${v.tally_voucher_no || 'N/A'}</code></td>
        <td>${actions}</td>
      `;
      vouchersTbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error fetching vouchers:', err);
  }
}

btnRefreshVouchers.addEventListener('click', fetchVouchers);

// Global approve sync function
window.approveVoucher = async (id) => {
  dialogTitle.textContent = 'Approving & Syncing...';
  dialogMessage.textContent = 'Pushing sales voucher to Tally Prime...';
  dialogLoader.classList.remove('hidden');
  dialogCloseBtn.classList.add('hidden');
  statusDialog.showModal();

  try {
    const res = await fetch(`/api/vouchers/approve/${id}`, {
      method: 'POST',
      headers: getHeaders()
    });

    if (res.status === 401) {
      statusDialog.close();
      return handleSessionExpired();
    }

    const data = await res.json();
    dialogLoader.classList.add('hidden');
    dialogCloseBtn.classList.remove('hidden');

    if (data.status === 'Synced') {
      dialogTitle.textContent = 'Sync Success!';
      dialogMessage.innerHTML = `Voucher approved & synced to Tally Prime!<br><br><strong>Voucher No:</strong> ${data.voucher_no}`;
    } else {
      dialogTitle.textContent = 'Tally Sync Failed';
      dialogMessage.innerHTML = `Saved locally as Failed, unable to import to Tally:<br><span style="color:var(--danger)">${escapeHtml(data.message)}</span>`;
    }
    
    fetchVouchers();
  } catch (err) {
    dialogLoader.classList.add('hidden');
    dialogCloseBtn.classList.remove('hidden');
    dialogTitle.textContent = 'Connection Error';
    dialogMessage.innerHTML = `Error contacting local sync server:<br><span style="color:var(--danger)">${escapeHtml(err.message)}</span>`;
  }
};

// Global reject function
window.rejectVoucher = async (id) => {
  if (!confirm('Are you sure you want to reject this voucher?')) return;

  try {
    const res = await fetch(`/api/vouchers/reject/${id}`, {
      method: 'POST',
      headers: getHeaders()
    });

    if (res.status === 401) {
      return handleSessionExpired();
    }

    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Voucher rejected successfully.');
      fetchVouchers();
    } else {
      alert('Failed to reject voucher: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    alert('Error connecting to server: ' + err.message);
  }
};

// ----------------------------------------------------
// UTILITY FUNCTIONS
// ----------------------------------------------------

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

function formatUIDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`; // DD/MM/YYYY
  }
  return dateStr;
}

function showToast(message) {
  // Simple toast alert
  alert(message);
}
