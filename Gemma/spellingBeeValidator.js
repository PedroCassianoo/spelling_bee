/**
 * spellingBeeValidator.js
 *
 * Estrutura de validação para o Spelling Bee.
 * Reconhece a sequência: [palavra] [letra por letra] [palavra]
 * e classifica o resultado em EXACT, AMBIGUOUS, INVALID_SEQUENCE ou NONE.
 *
 * Arquitetura em 4 camadas, cada uma isolada e testável:
 *   1. tokenize()                -> normaliza a transcrição em tokens
 *   2. buildExpectedLetterTokens() -> transforma a palavra-alvo em letras esperadas
 *   3. findLetterSequenceMatch() -> localiza o trecho de soletração letra-a-letra
 *   4. classifyWordMention()     -> compara pré/pós palavra contra EXACT ou variantes fonéticas
 *
 * O validateSpelling() orquestra as 4 camadas e devolve { correct, matchType }.
 */

// ---------------------------------------------------------------------------
// 1. NORMALIZAÇÃO / SANITIZAÇÃO
// ---------------------------------------------------------------------------
// Remove pontuação, colapsa espaços e força minúsculas antes de tokenizar.
// Hífen vira espaço (não pode colar dois tokens, ex: "c-a-t" -> "c a t").
function sanitize(rawTranscript) {
  return rawTranscript
    .toLowerCase()
    .replace(/[.,;:!?'"()]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(rawTranscript) {
  const clean = sanitize(rawTranscript);
  return clean.length ? clean.split(' ') : [];
}

// ---------------------------------------------------------------------------
// 2. SEQUÊNCIA DE LETRAS ESPERADA
// ---------------------------------------------------------------------------
// Converte "ice cream" em ['i','c','e','space','c','r','e','a','m']
// O token "space" representa a pausa/palavra "space" dita entre as duas palavras.
function buildExpectedLetterTokens(target) {
  const letters = [];
  for (const char of target.toLowerCase()) {
    letters.push(char === ' ' ? 'space' : char);
  }
  return letters;
}

// ---------------------------------------------------------------------------
// 3. LOCALIZAÇÃO DA SOLETRAÇÃO NA TRANSCRIÇÃO
// ---------------------------------------------------------------------------

// "Pulo do gato": um único dicionário de 26 letras, não um por palavra.
// Em produção isso vem do Supabase (tabela letter_phonetic_variants),
// crescendo por curadoria conforme o STT erra em produção:
//   id uuid pk
//   letter     char(1)   -- 'a'..'z'
//   variant    text      -- forma como o STT costuma transcrever ("see", "double u")
//   source     text      -- 'seed' | 'curated'
//   unique(letter, variant)
//
// Semente construída a partir do NOME fonético de cada letra em inglês
// (não é aleatório: "c" soa como "see" porque é assim que a letra se chama).
const letterPhoneticVariants = {
  a: ['a', 'ay', 'hey', 'ei'],
  b: ['b', 'bee', 'be'],
  c: ['c', 'see', 'sea', 'si'],
  d: ['d', 'dee'],
  e: ['e', 'ee'],
  f: ['f', 'eff'],
  g: ['g', 'gee'],
  h: ['h', 'aitch', 'each'],
  i: ['i', 'eye'],
  j: ['j', 'jay'],
  k: ['k', 'kay'],
  l: ['l', 'el'],
  m: ['m', 'em'],
  n: ['n', 'en'],
  o: ['o', 'oh'],
  p: ['p', 'pea', 'pee'],
  q: ['q', 'cue', 'queue'],
  r: ['r', 'are', 'ar'],
  s: ['s', 'ess'],
  t: ['t', 'tea', 'tee'],
  u: ['u', 'you', 'ewe'],
  v: ['v', 'vee'],
  w: ['w', 'double u'], // note: variante de 2 tokens, ver matchLetterAt()
  x: ['x', 'ex'],
  y: ['y', 'why'],
  z: ['z', 'zee', 'zed'],
};

// Tenta casar a letra esperada a partir de transcriptTokens[tIdx], testando
// as variantes do maior número de tokens pro menor (isso garante que "double u"
// vença um casamento parcial errado antes de cair no fallback de duplicação).
function matchLetterAt(transcriptTokens, tIdx, expectedLetter) {
  const variants = letterPhoneticVariants[expectedLetter] || [expectedLetter];
  const byLengthDesc = [...variants].sort((a, b) => b.split(' ').length - a.split(' ').length);

  for (const variant of byLengthDesc) {
    const variantTokens = variant.split(' ');
    const candidate = transcriptTokens.slice(tIdx, tIdx + variantTokens.length).join(' ');
    if (candidate === variant) {
      return { matched: true, phonetic: variant !== expectedLetter, tokensConsumed: variantTokens.length };
    }
  }
  return { matched: false, phonetic: false, tokensConsumed: 0 };
}

// Padrões como "double f" (= f f) ou "triple s" (= s s s), para letras
// duplicadas dentro da própria palavra (ex: muffin = m u f f i n).
// Importante: isso só entra como fallback DEPOIS de tentar matchLetterAt,
// porque "double" também é o nome fonético da letra "w" ("double u") e
// essa ambiguidade precisa ser resolvida na ordem certa.
const MULTIPLIER_WORDS = { double: 2, triple: 3 };

function tryMatchAt(transcriptTokens, expectedLetters, startIndex) {
  let tIdx = startIndex;
  let eIdx = 0;
  let usedPhonetic = false;

  while (eIdx < expectedLetters.length) {
    if (transcriptTokens[tIdx] === undefined) return null; // acabou a fala antes da soletração

    const expectedLetter = expectedLetters[eIdx];

    // 1) tenta bater a letra atual (exata ou variante fonética, incl. "double u")
    const direct = matchLetterAt(transcriptTokens, tIdx, expectedLetter);
    if (direct.matched) {
      usedPhonetic = usedPhonetic || direct.phonetic;
      eIdx += 1;
      tIdx += direct.tokensConsumed;
      continue;
    }

    // 2) senão, tenta "double X" / "triple X" para letra duplicada no alvo
    const multiplier = MULTIPLIER_WORDS[transcriptTokens[tIdx]];
    if (multiplier) {
      const letterToken = transcriptTokens[tIdx + 1];
      const expectedSlice = expectedLetters.slice(eIdx, eIdx + multiplier);
      const isValidDuplicate =
        letterToken &&
        expectedSlice.length === multiplier &&
        expectedSlice.every((l) => matchLetterAt([letterToken], 0, l).matched);

      if (isValidDuplicate) {
        eIdx += multiplier;
        tIdx += 2; // consome "double"/"triple" + a letra
        continue;
      }
    }

    return null;
  }

  return { start: startIndex, end: tIdx, usedPhonetic }; // end é exclusivo
}

function findLetterSequenceMatch(transcriptTokens, expectedLetters) {
  for (let i = 0; i < transcriptTokens.length; i++) {
    const match = tryMatchAt(transcriptTokens, expectedLetters, i);
    if (match) return match;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 4. CLASSIFICAÇÃO DA MENÇÃO DA PALAVRA (antes/depois da soletração)
// ---------------------------------------------------------------------------
// No projeto real, phoneticVariants deve vir do Supabase. Estrutura sugerida
// para a tabela `word_phonetic_variants`:
//   id           uuid (pk)
//   word         text        -- palavra-alvo normalizada, ex: "heavier"
//   variant      text        -- variação fonética aceita, ex: "have here"
//   source       text        -- 'auto' | 'curated' (curadoria manual do professor)
//   created_at   timestamp
//
// unique(word, variant) evita duplicidade. Isso te dá um mapeamento
// crescente conforme o Web Speech API erra de forma consistente.
const phoneticVariants = {
  heavier: ['have here', 'heavy r'],
};

function normalizeWordMention(tokens) {
  return tokens.join(' ').toLowerCase().trim();
}

function classifyWordMention(mentionTokens, targetWord) {
  const mention = normalizeWordMention(mentionTokens);
  if (mention === targetWord.toLowerCase()) return 'EXACT';

  const variants = phoneticVariants[targetWord.toLowerCase()] || [];
  if (variants.includes(mention)) return 'PHONETIC';

  return 'UNRECOGNIZED';
}

// ---------------------------------------------------------------------------
// ORQUESTRADOR
// ---------------------------------------------------------------------------
function validateSpelling(target, transcript) {
  const transcriptTokens = tokenize(transcript);
  const expectedLetters = buildExpectedLetterTokens(target);

  const match = findLetterSequenceMatch(transcriptTokens, expectedLetters);

  // A soletração letra-a-letra não bate com o alvo em nenhum trecho da fala.
  if (!match) {
    return {
      correct: false,
      matchType: 'NONE',
      details: { letterSequenceMatched: false }
    };
  }

  const preTokens = transcriptTokens.slice(0, match.start);
  const postTokens = transcriptTokens.slice(match.end);

  // Letras corretas, mas faltou dizer a palavra antes e/ou depois de soletrar.
  if (preTokens.length === 0 || postTokens.length === 0) {
    return { correct: false, matchType: 'INVALID_SEQUENCE' };
  }

  const preType = classifyWordMention(preTokens, target);
  const postType = classifyWordMention(postTokens, target);

  const wordsExact = preType === 'EXACT' && postType === 'EXACT';
  const wordsRecognized =
    (preType === 'EXACT' || preType === 'PHONETIC') &&
    (postType === 'EXACT' || postType === 'PHONETIC');

  // EXACT só quando NADA foi resolvido por variante fonética: nem a palavra
  // (pré/pós), nem nenhuma letra da soletração.
  if (wordsExact && !match.usedPhonetic) {
    return { correct: true, matchType: 'EXACT' };
  }

  // Palavra e/ou letras reconhecidas via variante fonética conhecida,
  // mas ainda assim uma tentativa válida e completa.
  if (wordsRecognized) {
    return { correct: true, matchType: 'AMBIGUOUS' };
  }

  // Letras certas, mas a palavra falada antes/depois não bate com o alvo
  // nem com nenhuma variante conhecida -> não dá pra confirmar a tentativa.
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
}

// ---------------------------------------------------------------------------
// LOGGING DE CANDIDATOS A VARIANTE (PLANO 1 - SUPABASE)
// ---------------------------------------------------------------------------
function validateSpellingAndLog(target, rawTranscript, supabaseClient) {
  const result = validateSpelling(target, rawTranscript);

  if (supabaseClient && result.matchType === 'NONE' && result.details?.letterSequenceMatched) {
    const { preType, postType, preMention, postMention } = result.details;
    if (preType === 'UNRECOGNIZED' && preMention) {
      logCandidateToSupabase(supabaseClient, target, preMention, 'pre', rawTranscript);
    }
    if (postType === 'UNRECOGNIZED' && postMention) {
      logCandidateToSupabase(supabaseClient, target, postMention, 'post', rawTranscript);
    }
  }

  return result; // mesma assinatura e compatibilidade total com validateSpelling
}

function logCandidateToSupabase(supabaseClient, targetWord, mention, position, rawTranscript) {
  if (!supabaseClient || typeof supabaseClient.rpc !== 'function') return;
  supabaseClient
    .rpc('log_variant_candidate', {
      p_target_word: targetWord,
      p_mention: mention,
      p_position: position,
      p_raw_transcript: rawTranscript,
    })
    .then(({ error }) => {
      if (error) console.error('Falha ao logar candidato de variante:', error);
    })
    .catch((err) => {
      console.error('Erro ao conectar ao Supabase para logar candidato:', err);
    });
}

// ---------------------------------------------------------------------------
// CARREGAMENTO DINÂMICO DE VARIANTES APROVADAS (PLANO 2 - SUPABASE)
// ---------------------------------------------------------------------------
async function loadApprovedVariants(supabaseClient) {
  if (!supabaseClient || typeof supabaseClient.from !== 'function') return;
  try {
    const { data, error } = await supabaseClient
      .from('word_phonetic_variants')
      .select('word, variant');

    if (error) {
      console.warn('Falha ao carregar variantes aprovadas do Supabase, mantendo seed local:', error);
      return;
    }

    if (Array.isArray(data)) {
      for (const row of data) {
        const key = (row.word || '').toLowerCase().trim();
        const val = (row.variant || '').toLowerCase().trim();
        if (!key || !val) continue;
        if (!phoneticVariants[key]) phoneticVariants[key] = [];
        if (!phoneticVariants[key].includes(val)) {
          phoneticVariants[key].push(val);
        }
      }
      console.log(`✅ [SpellingBeeValidator] ${data.length} variantes fonéticas aprovadas sincronizadas.`);
    }
  } catch (err) {
    console.warn('Erro ao sincronizar variantes aprovadas:', err);
  }
}

// ---------------------------------------------------------------------------
// TESTES
// ---------------------------------------------------------------------------
async function main() {
  const cases = [
    { target: 'cat', transcript: 'cat c a t cat', expected: { correct: true, matchType: 'EXACT' } },
    { target: 'cat', transcript: 'cat c a t', expected: { correct: false, matchType: 'INVALID_SEQUENCE' } },
    { target: 'cat', transcript: 'c a t cat', expected: { correct: false, matchType: 'INVALID_SEQUENCE' } },
    { target: 'cat', transcript: 'c a t', expected: { correct: false, matchType: 'INVALID_SEQUENCE' } },
    { target: 'cat', transcript: 'cat cat', expected: { correct: false, matchType: 'NONE' } },
    { target: 'cat', transcript: 'cat c o t cat', expected: { correct: false, matchType: 'NONE' } },
    { target: 'muffin', transcript: 'muffin m u double f i n muffin', expected: { correct: true, matchType: 'EXACT' } },
    { target: 'heavier', transcript: 'have here h e a v i e r have here', expected: { correct: true, matchType: 'AMBIGUOUS' } },
    { target: 'heavier', transcript: 'have here h e a v i e r', expected: { correct: false, matchType: 'INVALID_SEQUENCE' } },
    { target: 'ice cream', transcript: 'ice cream i c e space c r e a m ice cream', expected: { correct: true, matchType: 'EXACT' } },
    { target: 'ice cream', transcript: 'ice cream i c e space c r e a m', expected: { correct: false, matchType: 'INVALID_SEQUENCE' } },

    // --- Novos casos: sanitização + dicionário fonético de letras ---
    // Pontuação bruta do STT + letras ditas pelo nome fonético (c->see, a->hey, t->tea)
    { target: 'cat', transcript: 'Cat, see hey tea, cat!', expected: { correct: true, matchType: 'AMBIGUOUS' } },
    // "w" se chama "double u" -- precisa desambiguar do padrão "double X" de letra duplicada
    { target: 'wow', transcript: 'wow double u oh double u wow', expected: { correct: true, matchType: 'AMBIGUOUS' } },
    // letra dita errado e sem variante conhecida -> ainda cai em NONE, como deveria
    { target: 'cat', transcript: 'cat xyz hey tea cat', expected: { correct: false, matchType: 'NONE' } },
  ];

  let passed = 0;
  for (const c of cases) {
    const result = validateSpelling(c.target, c.transcript);
    const ok = result.correct === c.expected.correct && result.matchType === c.expected.matchType;
    console.log(
      `${ok ? '✅' : '❌'} target="${c.target}" | transcript="${c.transcript}" -> ${JSON.stringify(
        result
      )} (esperado ${JSON.stringify(c.expected)})`
    );
    if (ok) passed++;
  }
  console.log(`\n${passed}/${cases.length} casos passaram`);
}

// Executa os testes apenas se rodado diretamente no Node
if (typeof process !== 'undefined' && process.argv && process.argv[1] && process.argv[1].endsWith('spellingBeeValidator.js')) {
  main();
}

export {
  validateSpelling,
  validateSpellingAndLog,
  loadApprovedVariants,
  logCandidateToSupabase,
  phoneticVariants,
  tokenize,
  buildExpectedLetterTokens,
  findLetterSequenceMatch,
  classifyWordMention,
  sanitize
};

export default {
  validateSpelling,
  validateSpellingAndLog,
  loadApprovedVariants,
  logCandidateToSupabase,
  phoneticVariants,
  tokenize,
  buildExpectedLetterTokens,
  findLetterSequenceMatch,
  classifyWordMention,
  sanitize
};



