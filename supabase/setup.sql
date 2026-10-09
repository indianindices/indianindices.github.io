begin;

create table if not exists public.site_visitors (
  visitor_id uuid primary key,
  first_seen_at timestamptz not null default now()
);

create table if not exists public.premium_waitlist (
  email text primary key check (
    email = lower(btrim(email))
    and length(email) <= 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  visitor_id uuid not null references public.site_visitors(visitor_id),
  signed_up_at timestamptz not null default now(),
  consent_version text not null default 'premium-launch-v1'
);

alter table public.site_visitors enable row level security;
alter table public.premium_waitlist enable row level security;
revoke all on public.site_visitors, public.premium_waitlist from public, anon, authenticated;

create or replace function public.record_visit(p_visitor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_visitor_id is null then
    raise exception 'Visitor ID is required';
  end if;
  insert into public.site_visitors (visitor_id) values (p_visitor_id)
    on conflict (visitor_id) do nothing;
end;
$$;

create or replace function public.join_waitlist(p_email text, p_visitor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(btrim(p_email));
begin
  if normalized_email is null or length(normalized_email) > 254
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Invalid email address';
  end if;
  perform public.record_visit(p_visitor_id);
  insert into public.premium_waitlist (email, visitor_id)
    values (normalized_email, p_visitor_id)
    on conflict (email) do nothing;
end;
$$;

revoke all on function public.record_visit(uuid), public.join_waitlist(text, uuid) from public, anon, authenticated;
grant execute on function public.record_visit(uuid), public.join_waitlist(text, uuid) to anon;

create or replace view public.waitlist_metrics with (security_invoker = true) as
select
  visitors.total_visitors,
  signups.total_email_signups,
  signups.converted_visitors,
  coalesce(round(100.0 * signups.converted_visitors / nullif(visitors.total_visitors, 0), 2), 0) as conversion_percent
from (select count(*) as total_visitors from public.site_visitors) visitors
cross join (
  select count(*) as total_email_signups, count(distinct visitor_id) as converted_visitors
  from public.premium_waitlist
) signups;

revoke all on public.waitlist_metrics from public, anon, authenticated;

commit;