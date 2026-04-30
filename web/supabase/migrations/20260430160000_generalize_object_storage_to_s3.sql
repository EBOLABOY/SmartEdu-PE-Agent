alter table public.export_files
  drop constraint if exists export_files_provider_check;

alter table public.export_files
  add constraint export_files_provider_check
  check (provider in ('supabase-storage', 's3-compatible', 'cloudflare-r2'));

alter table public.artifact_versions
  drop constraint if exists artifact_versions_content_storage_provider_check;

alter table public.artifact_versions
  drop constraint if exists artifact_versions_content_storage_check;

alter table public.artifact_versions
  add constraint artifact_versions_content_storage_provider_check
  check (content_storage_provider in ('inline', 's3-compatible', 'cloudflare-r2'));

alter table public.artifact_versions
  add constraint artifact_versions_content_storage_check
  check (
    (
      content_storage_provider = 'inline'
      and content_storage_bucket is null
      and content_storage_object_key is null
    )
    or (
      content_storage_provider in ('s3-compatible', 'cloudflare-r2')
      and content_storage_bucket is not null
      and content_storage_object_key is not null
    )
  );
