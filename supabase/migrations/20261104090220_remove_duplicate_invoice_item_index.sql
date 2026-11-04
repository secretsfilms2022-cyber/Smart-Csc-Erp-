-- Remove a duplicate index on invoice_items.invoice_id.
-- The FK covering index remains: idx_fk_invoice_items_invoice_items_invoice_id_fkey.
drop index if exists public.invoice_items_invoice_idx;
