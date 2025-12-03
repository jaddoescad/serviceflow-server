Tests to Implement (server)
===========================

Notes
- Use Vitest + Supertest with mocked Supabase for fast route tests.
- Add a small integration layer later (against a test DB/branch) for the highest-risk paths: deal stage update, quote/invoice share views, and drip sequences.
- Ensure share routes are registered before `/:id` or mount them on distinct base paths before running those tests (currently they would be shadowed).

Health / Boot
- GET /health returns 200 {status:"ok"}.

Deals
- GET /deals filters by company_id/contact_id and preserves order/limit parsing.
- POST /deals requires company_id, first_name, stage; returns created deal with defaults.
- GET /deals/:id returns 404 when missing; returns deal with contact and service_address when present.
- GET /deals/:id/details returns aggregated payload with related quotes/invoices/contacts/company_members/crews/deal_notes/attachments; 404 when deal missing.
- GET /deals/:id/proposal-data returns composite payload; 404 on missing deal; respects optional quoteId filter.
- PATCH /deals/:id/stage: 200 updates stage; 400 when stage missing; 404 when id not found.

Contacts
- GET /contacts filters by company_id; returns addresses.
- POST /contacts enforces company_id + first_name; creates contact then addresses; returns combined record.
- GET /contacts/:id returns 404 when missing; returns addresses when found.

Companies
- GET /companies returns list.
- POST /companies requires name; inserts company; attempts to add creator to company_members; returns 500 when membership insert fails (and logs).
- GET /companies/:id returns 404 when missing.

Company Members
- GET /company-members requires company_id; returns member rows with user.
- GET /company-members/user/:user_id merges owned companies + memberships without duplicates.

Crews
- GET /crews filters by company_id.
- POST /crews requires company_id + name; returns created crew.
- GET /crews/:id returns 404 when missing.

Deal Notes
- GET /deal-notes filters by company_id/deal_id; joins author.
- POST /deal-notes requires company_id, deal_id, body; returns inserted note with author.

Appointments
- GET /appointments filters by company_id/deal_id.
- POST /appointments validates company_id, deal_id, scheduled_start, scheduled_end; returns created appointment.
- GET /appointments/:id returns 404 when missing.

Invoices
- GET /invoices filters by company_id/deal_id; returns line_items.
- POST /invoices requires company_id, deal_id, invoice_number; inserts invoice then line_items; returns combined invoice; surfaces 500 when line_items insert fails.
- GET /invoices/:id returns 404 when missing; returns line_items when present.
- GET /invoices/share/:shareId returns invoiceShare snapshot; 404 when missing. (Route order fix needed before this test.)

Quotes
- GET /quotes filters by company_id/deal_id; returns line_items.
- POST /quotes requires company_id, deal_id, quote_number; inserts quote then line_items; returns combined quote; 500 when line_items insert fails.
- GET /quotes/:id returns 404 when missing; returns line_items when present.
- GET /quotes/share/:shareId returns snapshot; 404 when missing. (Route order fix needed before this test.)

Product Templates
- GET /product-templates filters by company_id, type (excluding "all"), and ilike search on name.
- POST /product-templates requires company_id, name, type; creates record.
- PATCH /product-templates/:id updates record; returns 404 when missing.

Communication Templates
- GET /communication-templates filters by company_id.
- POST /communication-templates upserts by (company_id, template_key); reuses existing id when present; 400 when required fields missing.

Drip Sequences
- GET /drip-sequences filters by company_id/pipeline_id; includes steps.
- POST /drip-sequences requires company_id, pipeline_id, stage_id, name; creates sequence; returns created record.

Users
- GET /users/:id returns 404 when missing.
- POST /users upserts; requires id and email; returns saved profile.
- PATCH /users/:id updates partial profile; 404 when missing.

Error Handling
- respondWithError redacts SUPABASE keys and JWT-like strings from error messages.
