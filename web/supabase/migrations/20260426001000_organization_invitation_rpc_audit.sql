create or replace function public.create_organization_invitation(
  target_organization_id uuid,
  invitation_email text,
  invitation_role public.member_role,
  invitation_token_hash text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_invitation_id uuid;
  normalized_email text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not public.is_org_admin(target_organization_id) then
    raise exception 'organization admin required';
  end if;

  if invitation_role = 'owner' then
    raise exception 'owner invitations are not allowed';
  end if;

  normalized_email := lower(trim(invitation_email));

  if position('@' in normalized_email) <= 1 then
    raise exception 'invalid invitation email';
  end if;

  insert into public.organization_invitations (
    email,
    invited_by,
    organization_id,
    role,
    token_hash
  )
  values (
    normalized_email,
    auth.uid(),
    target_organization_id,
    invitation_role,
    invitation_token_hash
  )
  returning id into created_invitation_id;

  insert into public.audit_events (
    organization_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    target_organization_id,
    auth.uid(),
    'organization.invitation_created',
    'organization_invitation',
    created_invitation_id,
    jsonb_build_object(
      'email', normalized_email,
      'role', invitation_role
    )
  );

  return created_invitation_id;
end;
$$;

create or replace function public.revoke_organization_invitation(target_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_invitation public.organization_invitations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into target_invitation
  from public.organization_invitations
  where id = target_invitation_id;

  if target_invitation.id is null then
    raise exception 'invitation not found';
  end if;

  if not public.is_org_admin(target_invitation.organization_id) then
    raise exception 'organization admin required';
  end if;

  if target_invitation.status <> 'pending' then
    raise exception 'only pending invitations can be revoked';
  end if;

  update public.organization_invitations
  set status = 'revoked'
  where id = target_invitation.id;

  insert into public.audit_events (
    organization_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    target_invitation.organization_id,
    auth.uid(),
    'organization.invitation_revoked',
    'organization_invitation',
    target_invitation.id,
    jsonb_build_object(
      'email', target_invitation.email,
      'role', target_invitation.role
    )
  );
end;
$$;

create or replace function public.resend_organization_invitation(
  target_invitation_id uuid,
  next_token_hash text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_invitation public.organization_invitations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into target_invitation
  from public.organization_invitations
  where id = target_invitation_id;

  if target_invitation.id is null then
    raise exception 'invitation not found';
  end if;

  if not public.is_org_admin(target_invitation.organization_id) then
    raise exception 'organization admin required';
  end if;

  if target_invitation.status not in ('pending', 'expired') then
    raise exception 'only pending or expired invitations can be resent';
  end if;

  update public.organization_invitations
  set
    accepted_at = null,
    accepted_by = null,
    expires_at = now() + interval '7 days',
    status = 'pending',
    token_hash = next_token_hash
  where id = target_invitation.id;

  insert into public.audit_events (
    organization_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    target_invitation.organization_id,
    auth.uid(),
    'organization.invitation_resent',
    'organization_invitation',
    target_invitation.id,
    jsonb_build_object(
      'email', target_invitation.email,
      'role', target_invitation.role
    )
  );
end;
$$;

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

  insert into public.audit_events (
    organization_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    target_invitation.organization_id,
    auth.uid(),
    'organization.invitation_accepted',
    'organization_invitation',
    target_invitation.id,
    jsonb_build_object(
      'email', target_invitation.email,
      'role', target_invitation.role
    )
  );

  return target_invitation.organization_id;
end;
$$;

create or replace function public.update_organization_member_role(
  target_organization_id uuid,
  target_user_id uuid,
  next_role public.member_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.member_role;
  current_role public.member_role;
  owner_count integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select role into actor_role
  from public.organization_members
  where organization_id = target_organization_id
    and user_id = auth.uid();

  if actor_role not in ('owner', 'admin') then
    raise exception 'organization admin required';
  end if;

  select role into current_role
  from public.organization_members
  where organization_id = target_organization_id
    and user_id = target_user_id;

  if current_role is null then
    raise exception 'member not found';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'cannot change your own role';
  end if;

  if actor_role <> 'owner' and (current_role in ('owner', 'admin') or next_role in ('owner', 'admin')) then
    raise exception 'owner role required';
  end if;

  if current_role = 'owner' and next_role <> 'owner' then
    select count(*) into owner_count
    from public.organization_members
    where organization_id = target_organization_id
      and role = 'owner';

    if owner_count <= 1 then
      raise exception 'cannot demote the last owner';
    end if;
  end if;

  update public.organization_members
  set role = next_role
  where organization_id = target_organization_id
    and user_id = target_user_id;

  insert into public.audit_events (
    organization_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    target_organization_id,
    auth.uid(),
    'organization.member_role_updated',
    'organization_member',
    target_user_id,
    jsonb_build_object(
      'previous_role', current_role,
      'next_role', next_role,
      'target_user_id', target_user_id
    )
  );
end;
$$;

create or replace function public.remove_organization_member(
  target_organization_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.member_role;
  target_role public.member_role;
  owner_count integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select role into actor_role
  from public.organization_members
  where organization_id = target_organization_id
    and user_id = auth.uid();

  select role into target_role
  from public.organization_members
  where organization_id = target_organization_id
    and user_id = target_user_id;

  if target_role is null then
    raise exception 'member not found';
  end if;

  if target_user_id <> auth.uid() and actor_role not in ('owner', 'admin') then
    raise exception 'organization admin required';
  end if;

  if actor_role <> 'owner' and target_role in ('owner', 'admin') and target_user_id <> auth.uid() then
    raise exception 'owner role required';
  end if;

  if target_role = 'owner' then
    select count(*) into owner_count
    from public.organization_members
    where organization_id = target_organization_id
      and role = 'owner';

    if owner_count <= 1 then
      raise exception 'cannot remove the last owner';
    end if;
  end if;

  delete from public.organization_members
  where organization_id = target_organization_id
    and user_id = target_user_id;

  insert into public.audit_events (
    organization_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    target_organization_id,
    auth.uid(),
    'organization.member_removed',
    'organization_member',
    target_user_id,
    jsonb_build_object(
      'removed_role', target_role,
      'target_user_id', target_user_id
    )
  );
end;
$$;
