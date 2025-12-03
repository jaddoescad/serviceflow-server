Integration Tests to Implement (Server)
=======================================

Scope
- These hit a real test DB/Supabase branch (or local Postgres) and exercise routes/edge functions end-to-end. They go beyond the mocked unit/route tests in `teststoimplement.md`.

High-priority
- Deals stage update: PATCH /deals/:id/stage updates the row in DB and returns new stage; 404 when id missing.
- Deals fetch: GET /deals/:id returns contact + service_address relations as stored.
- Deals details/proposal-data: GET /deals/:id/details and /:id/proposal-data return all related collections; 404 when deal missing.
- Schedule-drips Edge Function: valid payload inserts deal_drip_jobs and cancels existing pending jobs; invalid payload returns 400; disabled sequence returns warning.
- Quotes: POST /quotes with line_items writes quote_line_items; GET /quotes/:id returns them; share route returns snapshot; 404 on missing.
- Invoices: POST /invoices with line_items writes invoice_line_items; GET /invoices/:id returns them; share route returns invoiceShare snapshot; 404 on missing.
- Contacts: POST /contacts with addresses inserts contact_addresses; GET /contacts/:id returns addresses.
- Companies: POST /companies inserts company and membership row; GET /companies/:id returns created data.
- Company members: GET /company-members/user/:user_id returns merged owned + member companies without duplicates.
- Product templates: search + type filters work against stored rows (`type=service/product`, `search` ilike).
- Communication templates: POST upserts by (company_id, template_key) and returns updated row on second call.

Notes
- Run against an isolated test database/branch to avoid mutating production data.
- Frontend integration tests are separate; they typically render UI and talk to mocked or real APIs. These entries are backend API/Edge-function integrations. 
