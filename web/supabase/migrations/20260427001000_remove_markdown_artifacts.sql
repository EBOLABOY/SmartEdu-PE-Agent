update public.artifacts a
set current_version_id = null
where exists (
  select 1
  from public.artifact_versions av
  where av.id = a.current_version_id
    and av.content_type = 'markdown'
);

delete from public.artifact_versions
where content_type = 'markdown';

delete from public.artifacts a
where a.stage = 'lesson'
  and not exists (
    select 1
    from public.artifact_versions av
    where av.artifact_id = a.id
  );

alter table public.artifact_versions
  drop constraint if exists artifact_versions_content_type_check;

alter table public.artifact_versions
  add constraint artifact_versions_content_type_check
  check (content_type in ('html', 'lesson-json'));
