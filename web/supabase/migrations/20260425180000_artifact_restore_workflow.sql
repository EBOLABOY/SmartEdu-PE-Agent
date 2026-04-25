create or replace function public.create_artifact_version(
  target_project_id uuid,
  artifact_stage public.artifact_stage,
  artifact_title text,
  artifact_content_type text,
  artifact_content text,
  artifact_status public.artifact_status,
  artifact_protocol_version text,
  artifact_workflow_trace jsonb default '{}'::jsonb,
  artifact_warning_text text default null,
  artifact_request_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_artifact_id uuid;
  next_version_number integer;
  new_version_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not public.is_project_member(target_project_id) then
    raise exception 'project access denied';
  end if;

  insert into public.artifacts (project_id, stage, title)
  values (target_project_id, artifact_stage, artifact_title)
  on conflict (project_id, stage) do update
    set title = excluded.title,
        updated_at = now()
  returning id into target_artifact_id;

  select coalesce(max(version_number), 0) + 1
    into next_version_number
  from public.artifact_versions
  where artifact_id = target_artifact_id;

  insert into public.artifact_versions (
    artifact_id,
    project_id,
    created_by,
    stage,
    content_type,
    content,
    status,
    protocol_version,
    workflow_trace,
    warning_text,
    version_number
  )
  values (
    target_artifact_id,
    target_project_id,
    auth.uid(),
    artifact_stage,
    artifact_content_type,
    artifact_content,
    artifact_status,
    artifact_protocol_version,
    artifact_workflow_trace,
    artifact_warning_text,
    next_version_number
  )
  returning id into new_version_id;

  update public.artifacts
  set current_version_id = new_version_id,
      updated_at = now()
  where id = target_artifact_id;

  if artifact_stage = 'lesson' then
    update public.artifacts
    set current_version_id = null,
        updated_at = now()
    where project_id = target_project_id
      and stage = 'html'
      and current_version_id is not null;
  end if;

  insert into public.audit_events (
    organization_id,
    project_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    request_id,
    metadata
  )
  select
    p.organization_id,
    target_project_id,
    auth.uid(),
    'artifact.version_created',
    'artifact_version',
    new_version_id,
    artifact_request_id,
    jsonb_build_object(
      'stage', artifact_stage,
      'version_number', next_version_number,
      'invalidated_stage', case when artifact_stage = 'lesson' then 'html' else null end
    )
  from public.projects p
  where p.id = target_project_id;

  return new_version_id;
end;
$$;

create or replace function public.restore_artifact_version(
  target_project_id uuid,
  target_version_id uuid,
  restore_request_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_artifact_id uuid;
  target_stage public.artifact_stage;
  target_version_number integer;
  previous_current_version_id uuid;
  invalidated_html_version_id uuid;
  target_organization_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not public.is_project_member(target_project_id) then
    raise exception 'project access denied';
  end if;

  select
    av.artifact_id,
    av.stage,
    av.version_number
  into
    target_artifact_id,
    target_stage,
    target_version_number
  from public.artifact_versions av
  where av.id = target_version_id
    and av.project_id = target_project_id;

  if target_artifact_id is null then
    raise exception 'artifact version not found';
  end if;

  select
    a.current_version_id,
    p.organization_id
  into
    previous_current_version_id,
    target_organization_id
  from public.artifacts a
  join public.projects p on p.id = a.project_id
  where a.id = target_artifact_id
    and a.project_id = target_project_id
  for update;

  if target_organization_id is null then
    raise exception 'artifact not found';
  end if;

  if previous_current_version_id = target_version_id then
    return target_version_id;
  end if;

  update public.artifacts
  set current_version_id = target_version_id,
      updated_at = now()
  where id = target_artifact_id;

  if target_stage = 'lesson' then
    select current_version_id
      into invalidated_html_version_id
    from public.artifacts
    where project_id = target_project_id
      and stage = 'html'
    for update;

    update public.artifacts
    set current_version_id = null,
        updated_at = now()
    where project_id = target_project_id
      and stage = 'html'
      and current_version_id is not null;
  end if;

  insert into public.audit_events (
    organization_id,
    project_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    request_id,
    metadata
  )
  values (
    target_organization_id,
    target_project_id,
    auth.uid(),
    'artifact.restored',
    'artifact_version',
    target_version_id,
    restore_request_id,
    jsonb_build_object(
      'artifact_id', target_artifact_id,
      'stage', target_stage,
      'restored_version_id', target_version_id,
      'restored_version_number', target_version_number,
      'previous_current_version_id', previous_current_version_id,
      'invalidated_stage', case when target_stage = 'lesson' then 'html' else null end,
      'invalidated_previous_current_version_id', invalidated_html_version_id
    )
  );

  return target_version_id;
end;
$$;
