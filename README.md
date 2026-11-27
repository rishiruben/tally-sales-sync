# Tally Sales Sync

A lightweight sales booking web portal and manager approval workflow backed by SQLite, with XML export and master-data sync for Tally Prime.

## Features

- **Role-Based Portal:** Separate `salesman` and `admin` workflows authenticated via session tokens.
- **Tally Master Sync & Mock Mode:** Pulls Sundry Debtors and Stock Items from Tally Prime over XML (`TALLY_URL`), or seeds simulated Indian GST masters locally when `TALLY_MOCK_MODE` is enabled.
- **GST Voucher Calculation:** Calculates intra-state (`CGST` + `SGST`) and inter-state (`IGST`) taxes alongside HSN codes and unit rates.
- **Approval Gate & Day Book:** Sales entries are saved locally as `Pending Approval` until an admin approves and posts the generated Tally XML voucher (or rejects it).

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. *(Optional)* Copy `.env.example` to `.env` and customize your Tally Prime settings:
   ```bash
   cp .env.example .env
   ```

3. Seed the local SQLite database (`sales.db`):
   ```bash
   npm run seed
   ```
   Demo accounts created by `seed.js`:
   - **Admin:** `admin` / `admin123`
   - **Salesman:** `salesman1` / `sales123` (or `salesman2` / `sales456`)

4. Start the server:
   ```bash
   npm start
   ```
   Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `TALLY_URL` | `http://localhost:9000` | Tally Prime XML gateway URL |
| `TALLY_COMPANY_NAME` | `Demo Company` | Target company name (`SVCURRENTCOMPANY`) in Tally XML |
| `MANAGER_EMAIL` | `manager@example.com` | Notification recipient logged when vouchers are submitted |
| `TALLY_MOCK_MODE` | `true` | Set to `false` to send live XML requests to Tally Prime |

## License

MIT — see [LICENSE](./LICENSE) for details.
