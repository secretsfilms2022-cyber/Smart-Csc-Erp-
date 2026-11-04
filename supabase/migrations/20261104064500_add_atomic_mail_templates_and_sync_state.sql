create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  template_key text not null,
  name text not null,
  subject_template text not null,
  body_template text not null,
  enabled boolean not null default true,
  created_by uuid null references auth.users(id),
  updated_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_templates_key_check check (template_key ~ '^[a-z0-9_]+$'),
  constraint email_templates_unique_key unique (business_id, template_key)
);

create index if not exists email_templates_business_idx on public.email_templates(business_id);
create index if not exists email_templates_enabled_idx on public.email_templates(business_id, enabled);

alter table public.email_templates enable row level security;

create policy email_templates_select on public.email_templates
  for select to authenticated
  using (business_id = private.user_business_id());

create policy email_templates_insert on public.email_templates
  for insert to authenticated
  with check (
    business_id = private.user_business_id()
    and private.has_permission(business_id, 'settings.manage')
  );

create policy email_templates_update on public.email_templates
  for update to authenticated
  using (
    business_id = private.user_business_id()
    and private.has_permission(business_id, 'settings.manage')
  )
  with check (
    business_id = private.user_business_id()
    and private.has_permission(business_id, 'settings.manage')
  );

create policy email_templates_delete on public.email_templates
  for delete to authenticated
  using (
    business_id = private.user_business_id()
    and private.has_permission(business_id, 'settings.manage')
  );

create table if not exists public.email_sync_state (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  provider text not null default 'atomicmail',
  mailbox text not null default 'surajkatira@smartcsc.work.gd',
  last_sync_at timestamptz null,
  last_received_at timestamptz null,
  last_message_id text null,
  last_error text null,
  sync_status text not null default 'never',
  messages_scanned integer not null default 0,
  messages_imported integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint email_sync_state_status_check check (sync_status in ('never','running','success','failed'))
);

alter table public.email_sync_state enable row level security;

create policy email_sync_state_select on public.email_sync_state
  for select to authenticated
  using (business_id = private.user_business_id());

create policy email_sync_state_insert on public.email_sync_state
  for insert to authenticated
  with check (business_id = private.user_business_id());

create policy email_sync_state_update on public.email_sync_state
  for update to authenticated
  using (business_id = private.user_business_id())
  with check (business_id = private.user_business_id());

insert into public.email_templates (business_id, template_key, name, subject_template, body_template)
select
  b.id, v.template_key, v.name, v.subject_template, v.body_template
from public.businesses b
cross join (values
  ('application_confirmation','Application Confirmation','Application {{application_number}} received - {{business_name}}','Dear {{customer_name}},\n\nYour application {{application_number}} has been received by {{business_name}}.\n\nStatus: {{application_status}}\nDate: {{date}}\n\nFor assistance, contact {{business_phone}} or {{business_email}}.\n\nRegards,\n{{business_name}}'),
  ('application_status','Application Status Update','Application {{application_number}} status update - {{business_name}}','Dear {{customer_name}},\n\nYour application {{application_number}} status is now: {{application_status}}.\n\nFor assistance, contact {{business_phone}} or {{business_email}}.\n\nRegards,\n{{business_name}}'),
  ('payment_receipt','Payment Receipt','Payment receipt {{payment_amount}} - {{business_name}}','Dear {{customer_name}},\n\nWe have received {{payment_amount}} on {{payment_date}} via {{payment_method}}.\n\nReference: {{application_number}} {{invoice_number}}\nPaid: {{paid_amount}}\nPending: {{pending_amount}}\n\nRegards,\n{{business_name}}'),
  ('pending_payment','Pending Payment Reminder','Payment pending for {{invoice_number}} - {{business_name}}','Dear {{customer_name}},\n\nA payment of {{pending_amount}} is currently pending for {{invoice_number}}.\n\nTotal: {{total_amount}}\nPaid: {{paid_amount}}\nPending: {{pending_amount}}\n\nPlease contact {{business_phone}} for payment assistance.\n\nRegards,\n{{business_name}}'),
  ('invoice','Invoice {{invoice_number}}','Invoice {{invoice_number}} from {{business_name}}','Dear {{customer_name}},\n\nYour invoice {{invoice_number}} dated {{date}} is ready.\n\nTotal: {{total_amount}}\nPaid: {{paid_amount}}\nBalance: {{pending_amount}}\n\n{{invoice_link}}\n\nRegards,\n{{business_name}}'),
  ('quotation','Quotation {{quotation_number}}','Quotation {{quotation_number}} from {{business_name}}','Dear {{customer_name}},\n\nYour quotation {{quotation_number}} is ready.\n\nValidity: {{quotation_valid_until}}\nTotal: {{total_amount}}\n\n{{quotation_link}}\n\nRegards,\n{{business_name}}'),
  ('customer_follow_up','Customer Follow-up','Follow-up from {{business_name}}','Dear {{customer_name}},\n\n{{message}}\n\nRegards,\n{{business_name}}')
) v(template_key,name,subject_template,body_template)
on conflict (business_id, template_key) do nothing;
