-- ==============================================================================
-- PLANO 2: TABELA DE VARIANTES APROVADAS E FUNÇÕES DE CURADORIA
-- Execute este script no SQL Editor do seu Dashboard Supabase
-- ==============================================================================

-- 1. Criação da tabela de variantes fonéticas aprovadas
create table if not exists word_phonetic_variants (
  id uuid primary key default gen_random_uuid(),
  word text not null,
  variant text not null,
  source text not null default 'curated' check (source in ('seed','curated')),
  created_at timestamptz not null default now(),
  unique (word, variant)
);

-- Habilita RLS na tabela de variantes aprovadas
alter table word_phonetic_variants enable row level security;

-- Política de leitura pública (necessário para o app do aluno ler no boot)
drop policy if exists "leitura publica de variantes aprovadas" on word_phonetic_variants;
create policy "leitura publica de variantes aprovadas"
  on word_phonetic_variants for select
  using (true);

-- Bloqueia inserção direta do app do aluno (anon)
revoke insert, update, delete on word_phonetic_variants from anon;

-- Permite leitura para anon e CRUD completo para curadores autenticados
grant select on word_phonetic_variants to anon;
grant select, insert, update, delete on word_phonetic_variants to authenticated;
grant select on word_variant_candidates to authenticated;

-- Políticas RLS para word_phonetic_variants
drop policy if exists "curadores inserem variantes" on word_phonetic_variants;
create policy "curadores inserem variantes"
  on word_phonetic_variants for insert
  to authenticated
  with check (auth.role() = 'authenticated');

drop policy if exists "curadores editam variantes" on word_phonetic_variants;
create policy "curadores editam variantes"
  on word_phonetic_variants for update
  to authenticated
  using (auth.role() = 'authenticated');

drop policy if exists "curadores excluem variantes" on word_phonetic_variants;
create policy "curadores excluem variantes"
  on word_phonetic_variants for delete
  to authenticated
  using (auth.role() = 'authenticated');

-- 2. Permissão de leitura dos candidatos pendentes para curadores autenticados
drop policy if exists "curadores leem candidatos" on word_variant_candidates;
create policy "curadores leem candidatos"
  on word_variant_candidates for select
  to authenticated
  using (auth.role() = 'authenticated');

-- 3. Função RPC para Aprovar Candidato (Move para variantes e marca como aprovado)
create or replace function approve_variant_candidate(
  p_candidate_id uuid,
  p_reviewer text default null
) returns void
language plpgsql
security definer
as $$
declare
  v_word text;
  v_mention text;
begin
  select target_word, candidate_mention
    into v_word, v_mention
  from word_variant_candidates
  where id = p_candidate_id;

  if v_word is null then
    raise exception 'Candidato não encontrado: %', p_candidate_id;
  end if;

  insert into word_phonetic_variants (word, variant, source)
  values (lower(trim(v_word)), lower(trim(v_mention)), 'curated')
  on conflict (word, variant) do nothing;

  update word_variant_candidates
  set status = 'approved',
      reviewed_by = coalesce(p_reviewer, auth.jwt() ->> 'email', 'admin'),
      reviewed_at = now()
  where id = p_candidate_id;
end;
$$;

-- 4. Função RPC para Rejeitar Candidato
create or replace function reject_variant_candidate(
  p_candidate_id uuid,
  p_reviewer text default null
) returns void
language plpgsql
security definer
as $$
begin
  update word_variant_candidates
  set status = 'rejected',
      reviewed_by = coalesce(p_reviewer, auth.jwt() ->> 'email', 'admin'),
      reviewed_at = now()
  where id = p_candidate_id;
end;
$$;

-- 5. Concede permissão de execução das RPCs para usuários autenticados
grant execute on function approve_variant_candidate(uuid, text) to authenticated;
grant execute on function reject_variant_candidate(uuid, text) to authenticated;

-- Opcional: Inserir semente inicial de variantes conhecidas (caso ainda não estejam salvas)
insert into word_phonetic_variants (word, variant, source)
values 
  ('heavier', 'have here', 'seed'),
  ('heavier', 'heavy r', 'seed')
on conflict (word, variant) do nothing;
