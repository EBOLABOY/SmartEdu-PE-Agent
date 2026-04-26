create or replace function public.is_org_admin(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = target_organization_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

create policy "profiles_select_shared_org_member" on public.profiles
for select using (
  id = auth.uid()
  or exists (
    select 1
    from public.organization_members viewer
    join public.organization_members target_member
      on target_member.organization_id = viewer.organization_id
    where viewer.user_id = auth.uid()
      and target_member.user_id = profiles.id
  )
);

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
end;
$$;
