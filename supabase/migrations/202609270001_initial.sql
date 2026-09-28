-- Saral production schema. Apply with the Supabase migration runner as project owner.
-- Sensitive payloads are AES-GCM envelopes encrypted by the application server.
create extension if not exists pgcrypto;

create table public.filings (
  id uuid primary key,
  owner_id uuid not null references auth.users(id),
  assessment_year text not null default '2026-27' check (assessment_year = '2026-27'),
  revision integer not null default 0 check (revision >= 0),
  status text not null check(status in ('draft','prepared','submission_pending','submitted','verification_pending','verified')),
  payload_ciphertext text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id, owner_id)
);
create index filings_owner_updated on public.filings(owner_id,updated_at desc);
create table public.profiles (
  owner_id uuid primary key references auth.users(id), payload_ciphertext text not null,
  updated_at timestamptz not null default now()
);
create table public.documents (
  id uuid primary key, owner_id uuid not null references auth.users(id), filing_id uuid not null,
  metadata_ciphertext text not null, status text not null check(status in ('retained','deleted')),
  expires_at timestamptz not null, created_at timestamptz not null default now(),
  foreign key(filing_id,owner_id) references public.filings(id,owner_id) on delete cascade
);
create index documents_retention on public.documents(expires_at) where status='retained';
create table public.audit_events (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null,
  filing_id uuid, action text not null, request_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index audit_owner_time on public.audit_events(owner_id,occurred_at desc);
create table public.rate_limits (key text primary key, count integer not null, expires_at timestamptz not null);

alter table public.filings enable row level security;
alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.audit_events enable row level security;
alter table public.rate_limits enable row level security;
create policy "read own encrypted filing" on public.filings for select to authenticated using((select auth.uid())=owner_id);
create policy "read own encrypted profile" on public.profiles for select to authenticated using((select auth.uid())=owner_id);
create policy "read own document metadata" on public.documents for select to authenticated using((select auth.uid())=owner_id);
create policy "read own audit" on public.audit_events for select to authenticated using((select auth.uid())=owner_id);
-- No end-user write policies. All writes go through the authenticated application server.
revoke all on public.filings,public.profiles,public.documents,public.audit_events,public.rate_limits from anon,authenticated;
grant select on public.filings,public.profiles,public.documents,public.audit_events to authenticated;
grant all on public.filings,public.profiles,public.documents,public.audit_events,public.rate_limits to service_role;

create or replace function public.save_filing(
  p_id uuid,p_owner uuid,p_expected_revision integer,p_revision integer,p_status text,p_payload text,p_action text,p_request_id uuid
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare affected integer;
begin
  if p_expected_revision is null then
    if p_revision<>0 then raise exception 'Invalid initial revision'; end if;
    insert into filings(id,owner_id,revision,status,payload_ciphertext) values(p_id,p_owner,p_revision,p_status,p_payload) on conflict(id) do nothing;
  else
    if p_revision<>p_expected_revision+1 then raise exception 'Invalid next revision'; end if;
    update filings set revision=p_revision,status=p_status,payload_ciphertext=p_payload,updated_at=now()
    where id=p_id and owner_id=p_owner and revision=p_expected_revision;
  end if;
  get diagnostics affected=row_count;
  if affected<>1 then return false; end if;
  insert into audit_events(owner_id,filing_id,action,request_id) values(p_owner,p_id,p_action,p_request_id);
  return true;
end $$;
create or replace function public.save_profile(p_owner uuid,p_payload text,p_request_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into profiles(owner_id,payload_ciphertext) values(p_owner,p_payload)
  on conflict(owner_id) do update set payload_ciphertext=excluded.payload_ciphertext,updated_at=now();
  insert into audit_events(owner_id,action,request_id) values(p_owner,'profile.updated',p_request_id);
end $$;
create or replace function public.delete_draft(p_owner uuid,p_id uuid,p_request_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare affected integer;
begin
  delete from filings where owner_id=p_owner and id=p_id and status in ('draft','prepared');
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Draft unavailable'; end if;
  insert into audit_events(owner_id,filing_id,action,request_id) values(p_owner,p_id,'filing.deleted',p_request_id);
end $$;
create or replace function public.consume_rate_limit(p_key text,p_limit integer,p_window_seconds integer)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare current_count integer;
begin
  if p_limit<1 or p_window_seconds<1 or p_window_seconds>86400 then raise exception 'Invalid rate limit'; end if;
  insert into rate_limits(key,count,expires_at) values(p_key,1,now()+make_interval(secs=>p_window_seconds))
  on conflict(key) do update set
    count=case when rate_limits.expires_at<=now() then 1 else rate_limits.count+1 end,
    expires_at=case when rate_limits.expires_at<=now() then now()+make_interval(secs=>p_window_seconds) else rate_limits.expires_at end
  returning count into current_count;
  return current_count<=p_limit;
end $$;
revoke all on function public.save_filing(uuid,uuid,integer,integer,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.save_profile(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.delete_draft(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.consume_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.save_filing(uuid,uuid,integer,integer,text,text,text,uuid) to service_role;
grant execute on function public.save_profile(uuid,text,uuid) to service_role;
grant execute on function public.delete_draft(uuid,uuid,uuid) to service_role;
grant execute on function public.consume_rate_limit(text,integer,integer) to service_role;

-- Raw files are NEVER public. Application envelopes add encryption on top of platform encryption.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('tax-documents','tax-documents',false,15000000,array['application/octet-stream'])
on conflict(id) do update set public=false,file_size_limit=15000000,allowed_mime_types=array['application/octet-stream'];
-- Intentionally no browser storage policies or signed public URLs; server-only access.
