create extension if not exists vector with schema extensions;

alter table public.standard_entries
add column if not exists embedding extensions.vector(1536);

create unique index if not exists standard_entries_corpus_external_id_idx
on public.standard_entries(corpus_id, external_id)
where external_id is not null;

create index if not exists standard_entries_embedding_idx
on public.standard_entries
using hnsw (embedding extensions.vector_cosine_ops)
where embedding is not null;

create or replace function public.match_standard_entries(
  query_embedding extensions.vector(1536),
  match_limit int default 6,
  similarity_threshold float default 0.3,
  target_market text default 'cn-compulsory-2022'
)
returns table (
  id uuid,
  corpus_id uuid,
  display_name text,
  issuer text,
  official_version text,
  source_url text,
  availability text,
  title text,
  module text,
  grade_bands text[],
  section_path text[],
  keywords text[],
  summary text,
  requirements text[],
  teaching_implications text[],
  citation text,
  similarity float
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return query
  select
    e.id,
    c.id as corpus_id,
    c.display_name,
    c.issuer,
    c.official_version,
    c.source_url,
    c.availability,
    e.title,
    e.module,
    e.grade_bands,
    e.section_path,
    e.keywords,
    e.summary,
    e.requirements,
    e.teaching_implications,
    e.citation,
    1 - (e.embedding <=> query_embedding) as similarity
  from public.standard_entries e
  join public.standards_corpora c on c.id = e.corpus_id
  where c.market = target_market
    and e.embedding is not null
    and 1 - (e.embedding <=> query_embedding) > similarity_threshold
  order by e.embedding <=> query_embedding
  limit match_limit;
end;
$$;

revoke all on function public.match_standard_entries(extensions.vector(1536), int, float, text) from public;
grant execute on function public.match_standard_entries(extensions.vector(1536), int, float, text) to authenticated;
