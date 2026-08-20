# Plano 1 — Logger de Candidatos a Variante (Supabase)

**Para a IA responsável pela implementação:** leia o documento `plano-integracao-validador.md` antes deste, se ainda não tiver aplicado. Este plano assume que `spellingBeeValidator.js` já está integrado ao `index.html` conforme aquele plano.

**Objetivo:** toda vez que um aluno soletrar as letras corretamente mas a palavra dita antes ou depois não for reconhecida (nem exata, nem variante conhecida — matchType `NONE` com letras batendo), registrar esse caso no Supabase como candidato a nova variante, sem interromper ou atrasar o feedback do aluno.

---

## 0. Regras inegociáveis

1. Não remova nenhuma função existente em `spellingBeeValidator.js` ou no `index.html`. Este plano só **adiciona** campos e funções novas.
2. `validateSpelling()` deve continuar sendo uma função pura (sem chamadas de rede, sem efeitos colaterais). O logging vive numa camada separada por cima dela.
3. O log nunca pode bloquear ou atrasar a resposta visual pro aluno. É fire-and-forget: dispara a chamada e segue o fluxo, sem `await` bloqueante na UI.
4. Se a chamada ao Supabase falhar (rede, RLS mal configurado etc.), isso deve cair num `console.error` e nada mais — nunca pode quebrar a experiência do aluno.
5. Se a estrutura real do projeto divergir do que este plano assume (nome do cliente Supabase, onde ele é inicializado etc.), pare e pergunte antes de inventar um caminho.

---

## 1. Pré-requisitos

- [ ] Confirmar acesso ao projeto Supabase (via dashboard ou CLI) com permissão para rodar migrations.
- [ ] Localizar no `index.html` onde o cliente Supabase já é inicializado (`createClient(...)`) — o projeto já usa Supabase, então esse client já existe em algum lugar do código.
- [ ] Fazer backup do `spellingBeeValidator.js` e do `index.html` atuais antes de editar.

---

## 2. Etapas

### 2.1 — Criar a tabela de candidatos (SQL)

```sql
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

create index if not exists idx_word_variant_candidates_status
  on word_variant_candidates (status);
```

`occurrence_count` evita que a mesma menção errada vire uma linha nova a cada tentativa — ele soma na existente. Isso também serve como sinal de prioridade: quanto mais alunos erram do mesmo jeito, mais essa variante merece ser aprovada.

### 2.2 — Bloquear acesso direto à tabela (segurança)

O app roda no client com a chave `anon`. Ninguém deve conseguir ler, editar ou apagar candidatos direto pela tabela — toda escrita passa por uma função RPC controlada.

```sql
alter table word_variant_candidates enable row level security;
revoke all on word_variant_candidates from anon, authenticated;
```

### 2.3 — Criar a função RPC de log

```sql
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

grant execute on function log_variant_candidate(text, text, text, text)
  to anon, authenticated;
```

`security definer` faz a função rodar com permissão de dono, então ela consegue escrever na tabela mesmo com RLS bloqueando o client direto. É o padrão recomendado do Supabase pra esse tipo de escrita controlada vinda do front-end.

### 2.4 — Editar `spellingBeeValidator.js` (adição, não substituição)

Adicionar informação de diagnóstico ao retorno de `validateSpelling`, **sem remover nenhum campo existente** (`correct` e `matchType` continuam exatamente como estão, só ganham um campo opcional a mais):

```javascript
// Dentro de validateSpelling(), nos dois pontos que hoje retornam
// { correct: false, matchType: 'NONE' }, trocar por:

// Caso 1 — nenhum trecho de soletração bateu com o alvo:
return {
  correct: false,
  matchType: 'NONE',
  details: { letterSequenceMatched: false },
};

// Caso 2 — letras bateram, mas a palavra antes/depois não foi reconhecida:
return {
  correct: false,
  matchType: 'NONE',
  details: {
    letterSequenceMatched: true,
    preType,
    postType,
    preMention: normalizeWordMention(preTokens),
    postMention: normalizeWordMention(postTokens),
  },
};
```

Em seguida, adicionar duas funções novas **no final do arquivo**, sem tocar nas existentes:

```javascript
// Wrapper opcional: usa validateSpelling() (pura, sem rede) e, só se cair
// no caso de menção não reconhecida, dispara o log em segundo plano.
function validateSpellingAndLog(target, rawTranscript, supabaseClient) {
  const result = validateSpelling(target, rawTranscript);

  if (result.matchType === 'NONE' && result.details?.letterSequenceMatched) {
    const { preType, postType, preMention, postMention } = result.details;
    if (preType === 'UNRECOGNIZED') {
      logCandidateToSupabase(supabaseClient, target, preMention, 'pre', rawTranscript);
    }
    if (postType === 'UNRECOGNIZED') {
      logCandidateToSupabase(supabaseClient, target, postMention, 'post', rawTranscript);
    }
  }

  return result; // mesma assinatura de retorno que validateSpelling, sem quebrar nada
}

function logCandidateToSupabase(supabaseClient, targetWord, mention, position, rawTranscript) {
  supabaseClient
    .rpc('log_variant_candidate', {
      p_target_word: targetWord,
      p_mention: mention,
      p_position: position,
      p_raw_transcript: rawTranscript,
    })
    .then(({ error }) => {
      if (error) console.error('Falha ao logar candidato de variante:', error);
    });
}
```

Por fim, incluir `validateSpellingAndLog` no objeto retornado pelo namespace `SpellingBeeValidator` (o mesmo bloco IIFE descrito no plano de integração anterior), ao lado de `validateSpelling`, sem remover nenhuma das entradas já existentes.

### 2.5 — Trocar a chamada no `index.html` (uma linha)

No ponto do modo Voice onde hoje se chama `SpellingBeeValidator.validateSpelling(target, transcript)`, trocar por:

```javascript
const result = SpellingBeeValidator.validateSpellingAndLog(target, transcript, supabaseClient);
```

Usando o cliente Supabase que já existe no projeto (identificado no passo 1). Se o modo Voice usa `result.correct` hoje, nada mais muda — o formato de retorno é o mesmo.

---

## 3. Testes obrigatórios

1. Simular no console um caso que deveria gerar log (letras certas, palavra não reconhecida) e confirmar, no dashboard do Supabase, que a linha aparece em `word_variant_candidates`.
2. Repetir a mesma tentativa duas vezes e confirmar que `occurrence_count` vai para 2, em vez de criar uma segunda linha.
3. Confirmar que um caso `EXACT` ou `AMBIGUOUS` **não** gera log nenhum.
4. Derrubar a conexão de rede (ou usar uma RPC com nome errado de propósito) e confirmar que o app não trava nem mostra erro pro aluno — só loga no console.
5. Rodar de novo os 14 casos de teste do `spellingBeeValidator.js` para garantir que `validateSpelling()` continua com o mesmo comportamento de antes.

---

## 4. Relatório final esperado da IA

- Confirmação de que a tabela e a função RPC foram criadas (com o SQL efetivamente executado, caso tenha sido ajustado).
- Linhas exatas alteradas em `spellingBeeValidator.js` e `index.html`.
- Resultado dos 5 testes acima.
- Confirmação de que nenhuma função existente foi removida ou teve a assinatura alterada.
