alter table public.artifact_versions
  drop constraint if exists artifact_versions_content_type_check;

alter table public.artifact_versions
  add constraint artifact_versions_content_type_check
  check (content_type in ('markdown', 'html', 'lesson-json'));
