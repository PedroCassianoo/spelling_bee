import { loadApprovedVariants, phoneticVariants, validateSpelling } from './spellingBeeValidator.js';

console.log('🧪 Iniciando Testes Unitários de Integração do Plano 2...\n');

let totalTests = 0;
let testsPassed = 0;

function assert(condition, testName) {
  totalTests++;
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    testsPassed++;
  } else {
    console.error(`❌ [FAIL] ${testName}`);
  }
}

// 1. Validar seed inicial antes do load
assert(Array.isArray(phoneticVariants.heavier) && phoneticVariants.heavier.includes('have here'), '1. Seed local de heavier contém "have here"');

// 2. Simular mock do Supabase trazendo novas variantes aprovadas
const mockSupabaseClient = {
  from: (tableName) => {
    if (tableName === 'word_phonetic_variants') {
      return {
        select: async () => {
          return {
            data: [
              { word: 'heavier', variant: 'heavy r' },
              { word: 'challenge', variant: 'shell engine' },
              { word: 'awesome', variant: 'o sum' }
            ],
            error: null
          };
        }
      };
    }
    return { select: async () => ({ data: [], error: null }) };
  }
};

await loadApprovedVariants(mockSupabaseClient);

// 3. Verificar merge dinâmico no objeto phoneticVariants
assert(
  phoneticVariants.challenge && phoneticVariants.challenge.includes('shell engine'),
  '2. Nova variante "shell engine" para "challenge" foi mesclada com sucesso'
);

assert(
  phoneticVariants.awesome && phoneticVariants.awesome.includes('o sum'),
  '3. Nova variante "o sum" para "awesome" foi mesclada com sucesso'
);

// 4. Testar se o validador agora reconhece "challenge" dita como "shell engine" como AMBIGUOUS (Acerto válido)
const resultChallenge = validateSpelling('challenge', 'shell engine c h a l l e n g e shell engine');
assert(
  resultChallenge.correct === true && resultChallenge.matchType === 'AMBIGUOUS',
  '4. Validador aceita com sucesso a nova variante "shell engine" como AMBIGUOUS'
);

// 5. Testar comportamento com falha de rede (deve manter variantes sem quebrar)
const mockFailingClient = {
  from: () => ({
    select: async () => ({ data: null, error: new Error('Network timeout') })
  })
};

try {
  await loadApprovedVariants(mockFailingClient);
  assert(true, '5. Falha de rede tratada graciosamente sem lançar exceção');
} catch (err) {
  assert(false, '5. Falha de rede lançou exceção');
}

console.log(`\n🎉 Resultado: ${testsPassed}/${totalTests} testes do Plano 2 passaram com sucesso!`);
