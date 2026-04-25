alter table public.messages
  add column if not exists ui_message_id text;

with ranked_messages as (
  select
    id,
    project_id,
    coalesce(nullif(trim(ui_message ->> 'id'), ''), id::text) as base_ui_message_id,
    row_number() over (
      partition by project_id, coalesce(nullif(trim(ui_message ->> 'id'), ''), id::text)
      order by created_at asc, id asc
    ) as duplicate_rank
  from public.messages
)
update public.messages as messages
set ui_message_id = case
  when ranked_messages.duplicate_rank = 1 then ranked_messages.base_ui_message_id
  else ranked_messages.base_ui_message_id || '-' || ranked_messages.id::text
end
from ranked_messages
where messages.id = ranked_messages.id
  and messages.ui_message_id is null;

alter table public.messages
  alter column ui_message_id set not null;

create unique index if not exists messages_project_id_ui_message_id_idx
  on public.messages (project_id, ui_message_id);
