create or replace function public.standard_entry_search_text(
  title text,
  module text,
  grade_bands text[],
  section_path text[],
  keywords text[],
  summary text,
  requirements text[],
  teaching_implications text[],
  citation text
)
returns text
language sql
immutable
as $$
  select trim(
    concat_ws(
      ' ',
      coalesce(title, ''),
      coalesce(module, ''),
      array_to_string(coalesce(grade_bands, array[]::text[]), ' '),
      array_to_string(coalesce(section_path, array[]::text[]), ' '),
      array_to_string(coalesce(keywords, array[]::text[]), ' '),
      coalesce(summary, ''),
      array_to_string(coalesce(requirements, array[]::text[]), ' '),
      array_to_string(coalesce(teaching_implications, array[]::text[]), ' '),
      coalesce(citation, '')
    )
  );
$$;

create or replace function public.standard_entry_search_document(
  title text,
  module text,
  grade_bands text[],
  section_path text[],
  keywords text[],
  summary text,
  requirements text[],
  teaching_implications text[],
  citation text
)
returns tsvector
language sql
immutable
as $$
  select
    setweight(to_tsvector('simple', coalesce(title, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(module, '')), 'B')
    || setweight(to_tsvector('simple', array_to_string(coalesce(grade_bands, array[]::text[]), ' ')), 'A')
    || setweight(to_tsvector('simple', array_to_string(coalesce(section_path, array[]::text[]), ' ')), 'B')
    || setweight(to_tsvector('simple', array_to_string(coalesce(keywords, array[]::text[]), ' ')), 'A')
    || setweight(to_tsvector('simple', coalesce(summary, '')), 'C')
    || setweight(to_tsvector('simple', array_to_string(coalesce(requirements, array[]::text[]), ' ')), 'B')
    || setweight(to_tsvector('simple', array_to_string(coalesce(teaching_implications, array[]::text[]), ' ')), 'C')
    || setweight(to_tsvector('simple', coalesce(citation, '')), 'D');
$$;

create index if not exists standard_entries_search_document_idx
on public.standard_entries
using gin (
  public.standard_entry_search_document(
    title,
    module,
    grade_bands,
    section_path,
    keywords,
    summary,
    requirements,
    teaching_implications,
    citation
  )
);

create or replace function public.match_standard_entries_hybrid(
  query_text text,
  query_embedding extensions.vector(1536),
  match_limit int default 6,
  target_market text default 'cn-compulsory-2022',
  vector_match_limit int default 24,
  lexical_match_limit int default 24,
  rrf_k int default 60
)
returns table (
  id uuid,
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
language sql
security definer
set search_path = public, extensions
as $$
  with normalized_query as (
    select nullif(regexp_replace(coalesce(query_text, ''), '\s+', ' ', 'g'), '') as raw_query
  ),
  vector_candidates as (
    select
      e.id,
      1 - (e.embedding <=> query_embedding) as similarity,
      row_number() over (order by e.embedding <=> query_embedding, e.id) as vector_rank
    from public.standard_entries e
    join public.standards_corpora c on c.id = e.corpus_id
    where c.market = target_market
      and e.embedding is not null
    order by e.embedding <=> query_embedding, e.id
    limit greatest(match_limit, vector_match_limit)
  ),
  lexical_query as (
    select
      raw_query,
      plainto_tsquery('simple', raw_query) as ts_query
    from normalized_query
    where raw_query is not null
  ),
  lexical_candidates as (
    select
      e.id,
      ts_rank_cd(
        public.standard_entry_search_document(
          e.title,
          e.module,
          e.grade_bands,
          e.section_path,
          e.keywords,
          e.summary,
          e.requirements,
          e.teaching_implications,
          e.citation
        ),
        lq.ts_query
      ) as lexical_score,
      row_number() over (
        order by
          ts_rank_cd(
            public.standard_entry_search_document(
              e.title,
              e.module,
              e.grade_bands,
              e.section_path,
              e.keywords,
              e.summary,
              e.requirements,
              e.teaching_implications,
              e.citation
            ),
            lq.ts_query
          ) desc,
          e.id
      ) as lexical_rank
    from public.standard_entries e
    join public.standards_corpora c on c.id = e.corpus_id
    cross join lexical_query lq
    where c.market = target_market
      and public.standard_entry_search_document(
        e.title,
        e.module,
        e.grade_bands,
        e.section_path,
        e.keywords,
        e.summary,
        e.requirements,
        e.teaching_implications,
        e.citation
      ) @@ lq.ts_query
    order by lexical_score desc, e.id
    limit greatest(match_limit, lexical_match_limit)
  ),
  candidate_ids as (
    select id from vector_candidates
    union
    select id from lexical_candidates
  ),
  fused_candidates as (
    select
      e.id,
      e.title,
      e.module,
      e.grade_bands,
      e.section_path,
      e.keywords,
      e.summary,
      e.requirements,
      e.teaching_implications,
      e.citation,
      coalesce(v.similarity, 0)::float as similarity,
      coalesce(l.lexical_score, 0)::float as lexical_score,
      case
        when nq.raw_query is not null
          and position(
            lower(nq.raw_query) in lower(
              public.standard_entry_search_text(
                e.title,
                e.module,
                e.grade_bands,
                e.section_path,
                e.keywords,
                e.summary,
                e.requirements,
                e.teaching_implications,
                e.citation
              )
            )
          ) > 0
        then 1.0 / (rrf_k + 1)
        else 0
      end as exact_match_bonus,
      (
        case
          when v.vector_rank is null then 0
          else 1.0 / (rrf_k + v.vector_rank)
        end
        +
        case
          when l.lexical_rank is null then 0
          else 1.0 / (rrf_k + l.lexical_rank)
        end
      ) as fused_score
    from candidate_ids ids
    join public.standard_entries e on e.id = ids.id
    left join vector_candidates v on v.id = e.id
    left join lexical_candidates l on l.id = e.id
    cross join normalized_query nq
  )
  select
    id,
    title,
    module,
    grade_bands,
    section_path,
    keywords,
    summary,
    requirements,
    teaching_implications,
    citation,
    similarity
  from fused_candidates
  order by
    (fused_score + exact_match_bonus) desc,
    exact_match_bonus desc,
    lexical_score desc,
    similarity desc,
    title asc
  limit greatest(match_limit, 1);
$$;

revoke all on function public.match_standard_entries_hybrid(text, extensions.vector(1536), int, text, int, int, int) from public;
grant execute on function public.match_standard_entries_hybrid(text, extensions.vector(1536), int, text, int, int, int) to authenticated;
