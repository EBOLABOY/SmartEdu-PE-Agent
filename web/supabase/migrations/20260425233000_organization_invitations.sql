create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  role public.member_role not null default 'teacher',
  token_hash text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index organization_invitations_org_status_idx
on public.organization_invitations (organization_id, status, created_at desc);

create unique index organization_invitations_pending_email_idx
on public.organization_invitations (organization_id, lower(email))
where status = 'pending';

create trigger organization_invitations_set_updated_at before update on public.organization_invitations
for each row execute function public.set_updated_at();

alter table public.organization_invitations enable row level security;

create policy "organization_invitations_select_member" on public.organization_invitations
for select using (public.is_org_member(organization_id));

create policy "organization_invitations_insert_admin" on public.organization_invitations
for insert with check (
  invited_by = auth.uid()
  and public.is_org_admin(organization_id)
);

create policy "organization_invitations_update_admin" on public.organization_invitations
for update using (public.is_org_admin(organization_id))
with check (public.is_org_admin(organization_id));

create or replace function public.accept_organization_invitation(invitation_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_invitation public.organization_invitations%rowtype;
  current_email text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  current_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  select * into target_invitation
  from public.organization_invitations
  where token_hash = encode(digest(invitation_token, 'sha256'), 'hex')
  limit 1;

  if target_invitation.id is null then
    raise exception 'invitation not found';
  end if;

  if target_invitation.status <> 'pending' then
    raise exception 'invitation is not pending';
  end if;

  if target_invitation.expires_at < now() then
    update public.organization_invitations
    set status = 'expired'
    where id = target_invitation.id;
    raise exception 'invitation expired';
  end if;

  if lower(target_invitation.email) <> current_email then
    raise exception 'invitation email does not match current user';
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (target_invitation.organization_id, auth.uid(), target_invitation.role)
  on conflict (organization_id, user_id) do update
    set role = excluded.role;

  update public.organization_invitations
  set
    accepted_at = now(),
    accepted_by = auth.uid(),
    status = 'accepted'
  where id = target_invitation.id;

  return target_invitation.organization_id;
end;
$$;
