-- Normalize invoice <-> quote link after duplicate migration attempts.
-- Goal:
-- - quote_id remains optional (invoices can exist without quotes)
-- - if linked, deleting the quote deletes the invoice (ON DELETE CASCADE)
-- - allow multiple invoices per quote (no unique index)

-- Drop any lingering unique index enforcing 1:1
drop index if exists invoices_quote_id_unique_not_null;

-- Replace FK with cascade (idempotent)
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'invoices_quote_id_fkey'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices drop constraint invoices_quote_id_fkey;
  end if;

  alter table public.invoices
    add constraint invoices_quote_id_fkey
    foreign key (quote_id) references public.quotes(id) on delete cascade;
end $$;

create index if not exists invoices_quote_id_idx on public.invoices(quote_id);
