alter table public.artifact_versions
  alter column content drop default;

alter table public.artifact_versions
  add column content_storage_provider text not null default 'inline'
    check (content_storage_provider in ('inline', 'cloudflare-r2')),
  add column content_storage_bucket text,
  add column content_storage_object_key text,
  add column content_byte_size bigint,
  add column content_checksum text;

update public.artifact_versions
set content_storage_provider = 'inline'
where content_storage_provider is distinct from 'inline';

alter table public.artifact_versions
  add constraint artifact_versions_content_storage_check
  check (
    (
      content_storage_provider = 'inline'
      and content_storage_bucket is null
      and content_storage_object_key is null
    )
    or (
      content_storage_provider = 'cloudflare-r2'
      and content_storage_bucket is not null
      and content_storage_object_key is not null
    )
  );

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
  artifact_request_id text default null,
  artifact_version_id uuid default null,
  artifact_content_storage_provider text default 'inline',
  artifact_content_storage_bucket text default null,
  artifact_content_storage_object_key text default null,
  artifact_content_byte_size bigint default null,
  artifact_content_checksum text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_artifact_id uuid;
  target_organization_id uuid;
  next_version_number integer;
  new_version_id uuid;
begin
  target_organization_id := public.require_project_writer(target_project_id);

  insert into public.artifacts (project_id, stage, title)
  values (target_project_id, artifact_stage, artifact_title)
  on conflict (project_id, stage) do update
    set title = excluded.title,
        updated_at = now()
  returning id into target_artifact_id;

  perform 1
  from public.artifacts
  where id = target_artifact_id
  for update;

  select coalesce(max(version_number), 0) + 1
    into next_version_number
  from public.artifact_versions
  where artifact_id = target_artifact_id;

  insert into public.artifact_versions (
    id,
    artifact_id,
    project_id,
    created_by,
    stage,
    content_type,
    content,
    content_storage_provider,
    content_storage_bucket,
    content_storage_object_key,
    content_byte_size,
    content_checksum,
    status,
    protocol_version,
    workflow_trace,
    warning_text,
    version_number
  )
  values (
    coalesce(artifact_version_id, gen_random_uuid()),
    target_artifact_id,
    target_project_id,
    auth.uid(),
    artifact_stage,
    artifact_content_type,
    artifact_content,
    artifact_content_storage_provider,
    artifact_content_storage_bucket,
    artifact_content_storage_object_key,
    artifact_content_byte_size,
    artifact_content_checksum,
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
  values (
    target_organization_id,
    target_project_id,
    auth.uid(),
    'artifact.version_created',
    'artifact_version',
    new_version_id,
    artifact_request_id,
    jsonb_build_object(
      'stage', artifact_stage,
      'version_number', next_version_number,
      'invalidated_stage', case when artifact_stage = 'lesson' then 'html' else null end,
      'content_storage_provider', artifact_content_storage_provider
    )
  );

  return new_version_id;
end;
$$;
