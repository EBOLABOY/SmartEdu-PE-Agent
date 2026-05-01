create table if not exists public.textbook_corpora (
  id uuid primary key default gen_random_uuid(),
  market text not null default 'cn-compulsory-2022',
  subject text not null default '体育与健康',
  education_stage text not null default '小学',
  publisher text not null,
  edition text,
  textbook_name text not null,
  curriculum_standard_version text not null default '2022',
  source_path text,
  license_scope text not null default 'local-authorized' check (
    license_scope in ('local-authorized', 'metadata-only', 'public-official-resource', 'school-owned')
  ),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (market, publisher, textbook_name, edition)
);

create table if not exists public.textbook_entries (
  id uuid primary key default gen_random_uuid(),
  corpus_id uuid not null references public.textbook_corpora(id) on delete cascade,
  external_id text not null,
  source_kind text not null default 'textbook-body' check (
    source_kind in ('textbook-body', 'teacher-guide', 'digital-demo-transcript', 'catalog')
  ),
  grade text,
  level text,
  volume text,
  module text not null,
  unit text,
  lesson text,
  sport_item text,
  section_path text[] not null default '{}',
  keywords text[] not null default '{}',
  title text not null,
  summary text not null,
  body_excerpt text not null,
  teaching_analysis text[] not null default '{}',
  technical_points text[] not null default '{}',
  teaching_suggestions text[] not null default '{}',
  safety_notes text[] not null default '{}',
  citation text not null,
  page_start int,
  page_end int,
  embedding extensions.vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (corpus_id, external_id)
);

create index if not exists textbook_entries_corpus_id_idx on public.textbook_entries(corpus_id);
create index if not exists textbook_entries_module_idx on public.textbook_entries(module);
create index if not exists textbook_entries_grade_idx on public.textbook_entries(grade);
create index if not exists textbook_entries_embedding_idx
on public.textbook_entries
using hnsw (embedding extensions.vector_cosine_ops)
where embedding is not null;

create or replace function public.textbook_entry_search_text(
  title text,
  module text,
  grade text,
  level text,
  volume text,
  unit text,
  lesson text,
  sport_item text,
  section_path text[],
  keywords text[],
  summary text,
  body_excerpt text,
  teaching_analysis text[],
  technical_points text[],
  teaching_suggestions text[],
  safety_notes text[],
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
      coalesce(grade, ''),
      coalesce(level, ''),
      coalesce(volume, ''),
      coalesce(unit, ''),
      coalesce(lesson, ''),
      coalesce(sport_item, ''),
      array_to_string(coalesce(section_path, array[]::text[]), ' '),
      array_to_string(coalesce(keywords, array[]::text[]), ' '),
      coalesce(summary, ''),
      coalesce(body_excerpt, ''),
      array_to_string(coalesce(teaching_analysis, array[]::text[]), ' '),
      array_to_string(coalesce(technical_points, array[]::text[]), ' '),
      array_to_string(coalesce(teaching_suggestions, array[]::text[]), ' '),
      array_to_string(coalesce(safety_notes, array[]::text[]), ' '),
      coalesce(citation, '')
    )
  );
$$;

create or replace function public.textbook_entry_search_document(
  title text,
  module text,
  grade text,
  level text,
  volume text,
  unit text,
  lesson text,
  sport_item text,
  section_path text[],
  keywords text[],
  summary text,
  body_excerpt text,
  teaching_analysis text[],
  technical_points text[],
  teaching_suggestions text[],
  safety_notes text[],
  citation text
)
returns tsvector
language sql
immutable
as $$
  select
    setweight(to_tsvector('simple', coalesce(title, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(module, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(grade, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(level, '')), 'B')
    || setweight(to_tsvector('simple', coalesce(unit, '')), 'B')
    || setweight(to_tsvector('simple', coalesce(lesson, '')), 'B')
    || setweight(to_tsvector('simple', coalesce(sport_item, '')), 'B')
    || setweight(to_tsvector('simple', array_to_string(coalesce(section_path, array[]::text[]), ' ')), 'B')
    || setweight(to_tsvector('simple', array_to_string(coalesce(keywords, array[]::text[]), ' ')), 'B')
    || setweight(to_tsvector('simple', coalesce(summary, '')), 'C')
    || setweight(to_tsvector('simple', coalesce(body_excerpt, '')), 'C')
    || setweight(to_tsvector('simple', array_to_string(coalesce(teaching_analysis, array[]::text[]), ' ')), 'C')
    || setweight(to_tsvector('simple', array_to_string(coalesce(technical_points, array[]::text[]), ' ')), 'C')
    || setweight(to_tsvector('simple', array_to_string(coalesce(teaching_suggestions, array[]::text[]), ' ')), 'C')
    || setweight(to_tsvector('simple', array_to_string(coalesce(safety_notes, array[]::text[]), ' ')), 'C')
    || setweight(to_tsvector('simple', coalesce(citation, '')), 'D');
$$;

create index if not exists textbook_entries_search_document_idx
on public.textbook_entries
using gin (
  public.textbook_entry_search_document(
    title,
    module,
    grade,
    level,
    volume,
    unit,
    lesson,
    sport_item,
    section_path,
    keywords,
    summary,
    body_excerpt,
    teaching_analysis,
    technical_points,
    teaching_suggestions,
    safety_notes,
    citation
  )
);

create or replace function public.match_textbook_entries_hybrid(
  query_text text,
  query_embedding extensions.vector(1536),
  match_limit int default 6,
  target_market text default 'cn-compulsory-2022',
  target_stage text default '小学',
  target_publisher text default null,
  target_grade text default null,
  vector_match_limit int default 24,
  lexical_match_limit int default 24,
  rrf_k int default 60
)
returns table (
  id uuid,
  corpus_id uuid,
  display_name text,
  publisher text,
  textbook_name text,
  edition text,
  source_kind text,
  grade text,
  level text,
  volume text,
  module text,
  unit text,
  lesson text,
  sport_item text,
  section_path text[],
  keywords text[],
  title text,
  summary text,
  body_excerpt text,
  teaching_analysis text[],
  technical_points text[],
  teaching_suggestions text[],
  safety_notes text[],
  citation text,
  page_start int,
  page_end int,
  similarity float
)
language sql
security definer
set search_path = public, extensions
as $$
  with normalized_query as (
    select nullif(regexp_replace(coalesce(query_text, ''), '\s+', ' ', 'g'), '') as raw_query
  ),
  grade_scope as (
    select
      case
        when target_grade is null then null::text[]
        when target_grade ~ '(1至2|一|二|水平一|1|2)' then array[
          '1至2年级',
          '一至二年级',
          '一年级',
          '二年级',
          '1年级',
          '2年级',
          '水平一'
        ]
        when target_grade ~ '(3至4|三|四|水平二|3|4)' then array[
          '3至4年级',
          '三至四年级',
          '三年级',
          '四年级',
          '3年级',
          '4年级',
          '水平二'
        ]
        when target_grade ~ '(5至6|五|六|水平三|5|6)' then array[
          '5至6年级',
          '五至六年级',
          '五年级',
          '六年级',
          '5年级',
          '6年级',
          '水平三'
        ]
        else array[target_grade]
      end as aliases
  ),
  scoped_entries as (
    select e.*
    from public.textbook_entries e
    join public.textbook_corpora c on c.id = e.corpus_id
    cross join grade_scope g
    where c.market = target_market
      and c.education_stage = target_stage
      and (target_publisher is null or c.publisher = target_publisher)
      and (
        target_grade is null
        or e.grade is null
        or e.grade = target_grade
        or e.grade like '%' || target_grade || '%'
        or e.grade = any(g.aliases)
        or e.level = any(g.aliases)
      )
  ),
  vector_candidates as (
    select
      e.id,
      1 - (e.embedding <=> query_embedding) as similarity,
      row_number() over (order by e.embedding <=> query_embedding, e.id) as vector_rank
    from scoped_entries e
    where e.embedding is not null
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
        public.textbook_entry_search_document(
          e.title,
          e.module,
          e.grade,
          e.level,
          e.volume,
          e.unit,
          e.lesson,
          e.sport_item,
          e.section_path,
          e.keywords,
          e.summary,
          e.body_excerpt,
          e.teaching_analysis,
          e.technical_points,
          e.teaching_suggestions,
          e.safety_notes,
          e.citation
        ),
        q.ts_query
      ) as lexical_score,
      row_number() over (
        order by
          ts_rank_cd(
            public.textbook_entry_search_document(
              e.title,
              e.module,
              e.grade,
              e.level,
              e.volume,
              e.unit,
              e.lesson,
              e.sport_item,
              e.section_path,
              e.keywords,
              e.summary,
              e.body_excerpt,
              e.teaching_analysis,
              e.technical_points,
              e.teaching_suggestions,
              e.safety_notes,
              e.citation
            ),
            q.ts_query
          ) desc,
          e.id
      ) as lexical_rank
    from scoped_entries e
    cross join lexical_query q
    where public.textbook_entry_search_document(
      e.title,
      e.module,
      e.grade,
      e.level,
      e.volume,
      e.unit,
      e.lesson,
      e.sport_item,
      e.section_path,
      e.keywords,
      e.summary,
      e.body_excerpt,
      e.teaching_analysis,
      e.technical_points,
      e.teaching_suggestions,
      e.safety_notes,
      e.citation
    ) @@ q.ts_query
    order by lexical_score desc, e.id
    limit greatest(match_limit, lexical_match_limit)
  ),
  fused as (
    select
      coalesce(v.id, l.id) as id,
      coalesce(1.0 / (rrf_k + v.vector_rank), 0) + coalesce(1.0 / (rrf_k + l.lexical_rank), 0) as fused_score,
      v.similarity,
      l.lexical_score
    from vector_candidates v
    full outer join lexical_candidates l on l.id = v.id
  ),
  selected as (
    select id
    from fused
    order by fused_score desc, similarity desc nulls last, lexical_score desc nulls last, id
    limit match_limit
  )
  select
    e.id,
    c.id as corpus_id,
    c.textbook_name as display_name,
    c.publisher,
    c.textbook_name,
    c.edition,
    e.source_kind,
    e.grade,
    e.level,
    e.volume,
    e.module,
    e.unit,
    e.lesson,
    e.sport_item,
    e.section_path,
    e.keywords,
    e.title,
    e.summary,
    e.body_excerpt,
    e.teaching_analysis,
    e.technical_points,
    e.teaching_suggestions,
    e.safety_notes,
    e.citation,
    e.page_start,
    e.page_end,
    coalesce(f.similarity, 0) as similarity
  from selected s
  join fused f on f.id = s.id
  join public.textbook_entries e on e.id = s.id
  join public.textbook_corpora c on c.id = e.corpus_id
  order by f.fused_score desc, f.similarity desc nulls last, f.lexical_score desc nulls last, e.id;
$$;

alter table public.textbook_corpora enable row level security;
alter table public.textbook_entries enable row level security;

drop policy if exists "textbook_corpora_select_authenticated" on public.textbook_corpora;
create policy "textbook_corpora_select_authenticated" on public.textbook_corpora
for select to authenticated using (true);

drop policy if exists "textbook_entries_select_authenticated" on public.textbook_entries;
create policy "textbook_entries_select_authenticated" on public.textbook_entries
for select to authenticated using (true);

revoke all on function public.match_textbook_entries_hybrid(
  text,
  extensions.vector(1536),
  int,
  text,
  text,
  text,
  text,
  int,
  int,
  int
) from public;
grant execute on function public.match_textbook_entries_hybrid(
  text,
  extensions.vector(1536),
  int,
  text,
  text,
  text,
  text,
  int,
  int,
  int
) to authenticated;
