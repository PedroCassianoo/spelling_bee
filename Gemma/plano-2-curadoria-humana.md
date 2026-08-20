# Plano 2 — Curadoria Humana dos Candidatos a Variante

**Para a IA responsável pela implementação:** este plano só deve ser executado depois que o `Plano 1 — Logger de Candidatos a Variante` já estiver em produção e a tabela `word_variant_candidates` já tiver dados reais acumulados (mesmo que poucos).

**Objetivo:** dar a um humano (Pedro ou um professor) uma forma simples de olhar as menções que o sistema não reconheceu, decidir quais delas passam a valer como resposta certa, e fazer essa decisão refletir automaticamente no validador em produção — sem precisar editar código toda vez.

---

## 0. Regras inegociáveis

1. Não remova nenhuma função, tabela ou política já criada no Plano 1.
2. A decisão de aprovar ou rejeitar uma variante é **sempre humana**. A IA não deve, em nenhuma hipótese, aprovar candidatos automaticamente (nem por `occurrence_count` alto, nem por qualquer heurística).
3. Este plano cria um arquivo novo (painel de curadoria). Ele **não deve alterar** o `index.html` principal, exceto por um link opcional apontando para o painel — o app do aluno continua intocado.
4. O acesso ao painel de curadoria precisa de alguma proteção (não pode ficar público na mesma URL do app do aluno).
5. Se a estrutura real divergir do assumido aqui, parar e perguntar antes de prosseguir.

---

## 1. Pré-requisitos

- [ ] Plano 1 em produção, com pelo menos alguns candidatos reais em `word_variant_candidates`.
- [ ] Confirmar se o projeto já tem algum sistema de autenticação (Supabase Auth, senha simples, etc). Se não tiver nenhum, usar a opção de senha compartilhada descrita no passo 2.3.

---

## 2. Etapas

### 2.1 — Garantir que a tabela de variantes aprovadas existe

Se `word_phonetic_variants` ainda não foi criada no Supabase (hoje ela só existe como objeto hardcoded no JS), criar agora:

```sql
create table if not exists word_phonetic_variants (
  id uuid primary key default gen_random_uuid(),
  word text not null,
  variant text not null,
  source text not null default 'curated' check (source in ('seed','curated')),
  created_at timestamptz not null default now(),
  unique (word, variant)
);

alter table word_phonetic_variants enable row level security;

-- Leitura pública: o app do aluno precisa carregar essas variantes no boot.
create policy "leitura publica de variantes aprovadas"
  on word_phonetic_variants for select
  using (true);

-- Escrita só via função RPC abaixo, nunca direto da tabela.
revoke insert, update, delete on word_phonetic_variants from anon, authenticated;
```

### 2.2 — Criar as funções RPC de aprovação e rejeição

```sql
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
  values (v_word, v_mention, 'curated')
  on conflict (word, variant) do nothing;

  update word_variant_candidates
  set status = 'approved', reviewed_by = p_reviewer, reviewed_at = now()
  where id = p_candidate_id;
end;
$$;

create or replace function reject_variant_candidate(
  p_candidate_id uuid,
  p_reviewer text default null
) returns void
language plpgsql
security definer
as $$
begin
  update word_variant_candidates
  set status = 'rejected', reviewed_by = p_reviewer, reviewed_at = now()
  where id = p_candidate_id;
end;
$$;

grant execute on function approve_variant_candidate(uuid, text) to authenticated;
grant execute on function reject_variant_candidate(uuid, text) to authenticated;
```

Note que essas duas funções exigem papel `authenticated`, não `anon` — só quem estiver logado no painel de curadoria (passo 2.3) consegue chamá-las.

### 2.3 — Criar o painel de curadoria (arquivo novo, isolado)

Criar um arquivo separado, por exemplo `admin-variantes.html`, **fora do fluxo do app do aluno**. Ele deve:

1. Pedir autenticação antes de mostrar qualquer dado. Duas opções, da mais simples pra mais robusta:
   - **Simples (curto prazo):** Supabase Auth com email/senha, criando um usuário único para Pedro/professores. As RPCs de aprovar/rejeitar já exigem `authenticated`, então isso já protege a escrita; para proteger a leitura da lista de candidatos, também é preciso RLS de `select` em `word_variant_candidates` restrita a `authenticated`.
   - **Mínima viável, se não houver tempo para Auth agora:** um campo de senha simples no próprio HTML, comparado no client contra uma variável, só para não deixar a URL completamente aberta. **Deixar claro no código que essa opção não é segura de verdade** e deve ser trocada por Supabase Auth assim que possível.

2. Listar os candidatos com `status = 'pending'`, ordenados por `occurrence_count` decrescente (os erros mais repetidos aparecem primeiro, porque são os que mais valem a pena revisar).

3. Para cada linha, mostrar: `target_word`, `candidate_mention`, `occurrence_count`, `raw_transcript` (pra dar contexto de como o STT ouviu), e dois botões: **Aprovar** e **Rejeitar**.

4. Aprovar chama:
   ```javascript
   await supabaseClient.rpc('approve_variant_candidate', {
     p_candidate_id: candidateId,
     p_reviewer: currentUserEmail,
   });
   ```
   Rejeitar chama o equivalente com `reject_variant_candidate`. Depois de qualquer uma das duas ações, remover a linha da lista na tela (ela não é mais `pending`).

Adicionar política de leitura para o painel enxergar os candidatos:

```sql
alter table word_variant_candidates enable row level security;
-- (se já estava habilitado desde o Plano 1, esta linha não faz nada de novo)

create policy "curadores leem candidatos pendentes"
  on word_variant_candidates for select
  using (auth.role() = 'authenticated');
```

### 2.4 — Fazer o validador em produção carregar as variantes aprovadas

Esta é a etapa que fecha o loop: hoje o objeto `phoneticVariants` dentro de `spellingBeeValidator.js` é fixo, escrito à mão. Sem este passo, aprovar um candidato no painel não muda nada no comportamento real do app.

**Não substituir o objeto `phoneticVariants` hardcoded.** Ele continua existindo como seed/fallback (caso a rede falhe). Adicionar uma função nova que faz merge das variantes vindas do Supabase por cima dele, chamada uma vez na inicialização do app:

```javascript
// Função nova, adicionada ao final de spellingBeeValidator.js,
// dentro do namespace SpellingBeeValidator.
async function loadApprovedVariants(supabaseClient) {
  const { data, error } = await supabaseClient
    .from('word_phonetic_variants')
    .select('word, variant');

  if (error) {
    console.error('Falha ao carregar variantes aprovadas, usando apenas o seed local:', error);
    return;
  }

  for (const row of data) {
    const key = row.word.toLowerCase();
    if (!phoneticVariants[key]) phoneticVariants[key] = [];
    if (!phoneticVariants[key].includes(row.variant)) {
      phoneticVariants[key].push(row.variant);
    }
  }
}
```

E no `index.html`, chamar `SpellingBeeValidator.loadApprovedVariants(supabaseClient)` uma vez, ao carregar a tela do modo Voice, antes de aceitar a primeira tentativa do aluno — sem remover nenhuma outra lógica de inicialização já existente.

---

## 3. Testes obrigatórios

1. Inserir manualmente um candidato de teste em `word_variant_candidates` com `status = 'pending'`.
2. Abrir o painel, confirmar que ele aparece na lista.
3. Aprovar o candidato e confirmar: (a) ele some da lista de pendentes; (b) uma linha nova aparece em `word_phonetic_variants`; (c) o `status` do candidato virou `approved`.
4. Recarregar o app do aluno e confirmar, via `console.log`, que `loadApprovedVariants` trouxe essa nova variante para `phoneticVariants`.
5. Testar essa variante recém-aprovada no modo Voice de verdade e confirmar que agora ela retorna `matchType: 'AMBIGUOUS'` em vez de `NONE`.
6. Testar o botão Rejeitar num segundo candidato e confirmar que ele não aparece em `word_phonetic_variants`.
7. Confirmar que um usuário não autenticado não consegue chamar as RPCs de aprovar/rejeitar nem ler a lista de candidatos (testar sem login).

---

## 4. Relatório final esperado da IA

- SQL efetivamente executado (tabelas, policies, funções).
- Confirmação de que `admin-variantes.html` é um arquivo isolado e que `index.html` só recebeu a chamada de `loadApprovedVariants` (mais link opcional), nada além disso.
- Resultado dos 7 testes acima.
- Qual opção de autenticação foi usada no painel (Auth completo ou senha simples) e, se foi a segunda, um aviso explícito de que isso deve ser trocado antes de expor o painel fora da rede da escola.
