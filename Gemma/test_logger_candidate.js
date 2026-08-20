import { validateSpellingAndLog, validateSpelling } from './spellingBeeValidator.js';

console.log('🧪 Iniciando Testes Unitários de Logging de Candidatos (Plano 1)...\n');

let rpcCalls = [];

const mockSupabaseClient = {
  rpc: (funcName, params) => {
    rpcCalls.push({ funcName, params });
    return Promise.resolve({ data: null, error: null });
  }
};

const mockFailingSupabaseClient = {
  rpc: (funcName, params) => {
    return Promise.reject(new Error('Simulated network error'));
  }
};

let testsPassed = 0;
let totalTests = 0;

function assert(condition, testName) {
  totalTests++;
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    testsPassed++;
  } else {
    console.error(`❌ [FAIL] ${testName}`);
  }
}

// 1. Caso EXACT: Não deve logar
rpcCalls = [];
let res1 = validateSpellingAndLog('cat', 'cat c a t cat', mockSupabaseClient);
assert(res1.correct === true && res1.matchType === 'EXACT' && rpcCalls.length === 0, '1. Caso EXACT não deve gerar chamadas RPC');

// 2. Caso AMBIGUOUS: Não deve logar
rpcCalls = [];
let res2 = validateSpellingAndLog('cat', 'Cat, see hey tea, cat!', mockSupabaseClient);
assert(res2.correct === true && res2.matchType === 'AMBIGUOUS' && rpcCalls.length === 0, '2. Caso AMBIGUOUS não deve gerar chamadas RPC');

// 3. Caso INVALID_SEQUENCE: Não deve logar
rpcCalls = [];
let res3 = validateSpellingAndLog('cat', 'c a t', mockSupabaseClient);
assert(res3.correct === false && res3.matchType === 'INVALID_SEQUENCE' && rpcCalls.length === 0, '3. Caso INVALID_SEQUENCE não deve gerar chamadas RPC');

// 4. Caso Letras Erradas (NONE por letras): Não deve logar
rpcCalls = [];
let res4 = validateSpellingAndLog('cat', 'cat c o t cat', mockSupabaseClient);
assert(res4.correct === false && res4.matchType === 'NONE' && res4.details?.letterSequenceMatched === false && rpcCalls.length === 0, '4. Caso com letras erradas não deve gerar chamadas RPC');

// 5. Caso Letras Corretas + Menção Não Reconhecida: DEVE LOGAR!
rpcCalls = [];
let res5 = validateSpellingAndLog('heavier', 'somethingsomething h e a v i e r otherthing', mockSupabaseClient);
assert(
  res5.correct === false &&
  res5.matchType === 'NONE' &&
  res5.details?.letterSequenceMatched === true &&
  rpcCalls.length === 2 &&
  rpcCalls[0].funcName === 'log_variant_candidate' &&
  rpcCalls[0].params.p_target_word === 'heavier' &&
  rpcCalls[0].params.p_position === 'pre' &&
  rpcCalls[0].params.p_mention === 'somethingsomething' &&
  rpcCalls[1].params.p_position === 'post' &&
  rpcCalls[1].params.p_mention === 'otherthing',
  '5. Letras corretas com menções não reconhecidas devem logar pre e post na RPC'
);

// 6. Falha de rede/Supabase não quebra a execução do app
try {
  let res6 = validateSpellingAndLog('heavier', 'unknownword h e a v i e r unknownword', mockFailingSupabaseClient);
  assert(res6.correct === false && res6.matchType === 'NONE', '6. Erro de RPC/rede é tratado graciosamente sem lançar exceção');
} catch (err) {
  assert(false, '6. Erro de RPC/rede lançou exceção');
}

console.log(`\n🎉 Resultado: ${testsPassed}/${totalTests} testes de logging passaram com sucesso!`);
