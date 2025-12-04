-- Create change orders table
create table if not exists public.change_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  change_order_number text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  accepted_at timestamptz,
  signer_name text,
  signer_email text,
  signature_text text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists change_orders_company_number_key
  on public.change_orders(company_id, change_order_number);

-- Reuse quote line items for change orders by tagging them
alter table public.quote_line_items
  add column if not exists change_order_id uuid references public.change_orders(id) on delete cascade,
  add column if not exists is_change_order boolean not null default false;

create index if not exists quote_line_items_change_order_id_idx
  on public.quote_line_items(change_order_id);

-- Track which invoice line items came from which change order
alter table public.invoice_line_items
  add column if not exists change_order_id uuid references public.change_orders(id) on delete set null;

create index if not exists invoice_line_items_change_order_id_idx
  on public.invoice_line_items(change_order_id);

comment on table public.change_orders is 'Customer change orders for proposals/quotes';
