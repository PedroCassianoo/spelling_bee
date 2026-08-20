-- ==============================================================================
-- PLANO 1: LOGGER DE CANDIDATOS A VARIANTE FONÉTICA (SUPABASE)
-- Execute este script no SQL Editor do seu Dashboard Supabase
-- ==============================================================================

-- 1. Criação da tabela de candidatos
create table if not exists word_variant_candidates (
  id uuid primary key default gen_random_uuid(),
  target_word text not null,
  candidate_mention text not null,
  mention_position text not null check (mention_position in ('pre','post')),
  raw_transcript text,
  occurrence_count integer not null default 1,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  reviewed_by text,
  reviewed_at timestamptz,
  unique (target_word, candidate_mention)
);

-- Índice para acelerar a triagem de candidatos pendentes no painel de curadoria
create index if not exists idx_word_variant_candidates_status
  on word_variant_candidates (status);

-- 2. Segurança: Habilita RLS e bloqueia acessos diretos de escrita/leitura pelo client anon
alter table word_variant_candidates enable row level security;
revoke all on word_variant_candidates from anon, authenticated;

-- 3. Função RPC com Security Definer para inserção segura com agregação de ocorrências
create or replace function log_variant_candidate(
  p_target_word text,
  p_mention text,
  p_position text,
  p_raw_transcript text
) returns void
language plpgsql
security definer
as $$
begin
  insert into word_variant_candidates
    (target_word, candidate_mention, mention_position, raw_transcript)
  values
    (lower(trim(p_target_word)), lower(trim(p_mention)), p_position, p_raw_transcript)
  on conflict (target_word, candidate_mention)
  do update set
    occurrence_count = word_variant_candidates.occurrence_count + 1,
    last_seen_at = now();
end;
$$;

-- Permite que clientes web (papel anon ou authenticated) executem apenas esta RPC
grant execute on function log_variant_candidate(text, text, text, text)
  to anon, authenticated;
