alter table public.messages
  add column if not exists is_active boolean not null default true;

create index if not exists messages_project_id_is_active_created_at_idx
  on public.messages (project_id, is_active, created_at desc);

create index if not exists messages_conversation_id_is_active_created_at_idx
  on public.messages (conversation_id, is_active, created_at asc);
