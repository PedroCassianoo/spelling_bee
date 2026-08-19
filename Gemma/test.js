// test.js
// Suíte de testes automatizados para o microsserviço de validação Gemma e regras de Spelling Bee
// Utiliza o test runner nativo do Node (node:test e node:assert)

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { CONFIG, VALIDATION_RESPONSE_SCHEMA } from './config.js';
import { buildSpellingJudgePrompt } from './promptBuilder.js';
import { validateSpellingStructure } from './sequenceValidator.js';
import { judgeSpellingAttempt } from './ollamaClient.js';

test('CONFIG and SCHEMA: properties are properly defined', () => {
  assert.equal(typeof CONFIG.PORT, 'number');
  assert.equal(typeof CONFIG.OLLAMA_TIMEOUT_MS, 'number');
  assert.equal(typeof CONFIG.MAX_CONCURRENT_REQUESTS, 'number');
  assert.deepEqual(VALIDATION_RESPONSE_SCHEMA.properties.matchType.enum, [
    'EXACT',
    'AMBIGUOUS',
    'INVALID_SEQUENCE',
    'NONE',
  ]);
});

test('promptBuilder: enforces 3-step rule and negative sequence examples', () => {
  const prompt = buildSpellingJudgePrompt('cat', 'cat c a t cat', 'J1');
  assert.match(prompt, /TARGET: "cat"/);
  assert.match(prompt, /STUDENT'S STT TRANSCRIPT: "cat c a t cat"/);
  assert.match(prompt, /CORE 3-STEP RULE/);
  assert.match(prompt, /"INVALID_SEQUENCE"/);
  assert.match(prompt, /"EXACT"/);
  assert.match(prompt, /"AMBIGUOUS"/);
});

test('sequenceValidator: POP Rule 1 - 3 Steps (Say -> Spell -> Say)', () => {
  // Cenário 1: Sequência Completa Perfeita
  const exact = validateSpellingStructure('cat', 'cat c a t cat');
  assert.equal(exact.correct, true);
  assert.equal(exact.matchType, 'EXACT');
  assert.equal(exact.heard, 'C-A-T');

  // Cenário 2: Faltou falar a palavra no final (apenas falou e soletrou) -> INVALID_SEQUENCE
  const missingEnd = validateSpellingStructure('cat', 'cat c a t');
  assert.equal(missingEnd.correct, false);
  assert.equal(missingEnd.matchType, 'INVALID_SEQUENCE');
  assert.match(missingEnd.explanation, /again after spelling/);

  // Cenário 3: Faltou falar a palavra no início (apenas soletrou e falou no final) -> INVALID_SEQUENCE
  const missingStart = validateSpellingStructure('cat', 'c a t cat');
  assert.equal(missingStart.correct, false);
  assert.equal(missingStart.matchType, 'INVALID_SEQUENCE');
  assert.match(missingStart.explanation, /before spelling/);

  // Cenário 4: Apenas soletrou as letras sem falar a palavra antes nem depois -> INVALID_SEQUENCE
  const onlySpelled = validateSpellingStructure('cat', 'c a t');
  assert.equal(onlySpelled.correct, false);
  assert.equal(onlySpelled.matchType, 'INVALID_SEQUENCE');
  assert.match(onlySpelled.explanation, /3-step rule/);

  // Cenário 5: Apenas repetiu as palavras sem soletrar letras -> NONE
  const noSpelling = validateSpellingStructure('cat', 'cat cat');
  assert.equal(noSpelling.correct, false);
  assert.equal(noSpelling.matchType, 'NONE');
});

test('sequenceValidator: POP Rule 2 - Double Letters (DOUBLE P, TWO P)', () => {
  const doubleLetter = validateSpellingStructure('muffin', 'muffin m u double f i n muffin');
  assert.equal(doubleLetter.correct, true);
  assert.equal(doubleLetter.matchType, 'EXACT');
  assert.equal(doubleLetter.heard, 'M-U-F-F-I-N');

  const twoLetter = validateSpellingStructure('apple', 'apple a two p l e apple');
  assert.equal(twoLetter.correct, true);
  assert.equal(twoLetter.matchType, 'EXACT');
  assert.equal(twoLetter.heard, 'A-P-P-L-E');
});

test('sequenceValidator: POP Rule 3 - Space and Delimiters for Compound Words', () => {
  const compound = validateSpellingStructure('ice cream', 'ice cream i c e space c r e a m ice cream');
  assert.equal(compound.correct, true);
  assert.equal(compound.matchType, 'EXACT');
  assert.equal(compound.heard, 'I-C-E-C-R-E-A-M');

  // Faltou a palavra final em termo composto -> INVALID_SEQUENCE
  const compoundMissingEnd = validateSpellingStructure('ice cream', 'ice cream i c e space c r e a m');
  assert.equal(compoundMissingEnd.correct, false);
  assert.equal(compoundMissingEnd.matchType, 'INVALID_SEQUENCE');
});

test('sequenceValidator: POP Rule 4 - STT Acoustic Tolerance on Boundaries', () => {
  // Mic ouviu 'have here' no lugar de 'heavier' nas duas pontas
  const acoustic = validateSpellingStructure('heavier', 'have here h e a v i e r have here');
  assert.equal(acoustic.correct, true);
  assert.equal(acoustic.matchType, 'AMBIGUOUS');
  assert.equal(acoustic.heard, 'H-E-A-V-I-E-R');

  // Mic com ruído, mas faltou repetir no final -> INVALID_SEQUENCE
  const acousticMissingEnd = validateSpellingStructure('heavier', 'have here h e a v i e r');
  assert.equal(acousticMissingEnd.correct, false);
  assert.equal(acousticMissingEnd.matchType, 'INVALID_SEQUENCE');
});

test('ollamaClient: parses valid response and enforces anti-hallucination safety', async () => {
  // Mock Ollama retornando incorretamente EXACT para uma tentativa sem palavra final
  const mockServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        response: JSON.stringify({
          correct: true,
          matchType: 'EXACT',
          heard: 'C-A-T',
          explanation: 'Awesome spelling!',
          confidence: 0.98,
        }),
      }));
    });
  });

  await new Promise(resolve => mockServer.listen(0, resolve));
  const port = mockServer.address().port;
  const originalUrl = CONFIG.OLLAMA_URL;
  CONFIG.OLLAMA_URL = `http://localhost:${port}`;

  try {
    // Tentativa COM 3 passos completos -> Deve ser aceita como EXACT
    const resultValid = await judgeSpellingAttempt('cat', 'cat c a t cat', 'J1');
    assert.equal(resultValid.correct, true);
    assert.equal(resultValid.matchType, 'EXACT');

    // Tentativa SEM repetição final -> Trava de segurança deve forçar INVALID_SEQUENCE com correct=false
    const resultMissingEnd = await judgeSpellingAttempt('cat', 'cat c a t', 'J1');
    assert.equal(resultMissingEnd.correct, false);
    assert.equal(resultMissingEnd.matchType, 'INVALID_SEQUENCE');
  } finally {
    CONFIG.OLLAMA_URL = originalUrl;
    mockServer.close();
  }
});

test('ollamaClient: handles Ollama offline gracefully with native fallback', async () => {
  const originalUrl = CONFIG.OLLAMA_URL;
  CONFIG.OLLAMA_URL = 'http://localhost:59999'; // Porta fechada

  try {
    const result = await judgeSpellingAttempt('cat', 'cat c a t cat', 'J1');
    assert.equal(result.correct, true);
    assert.equal(result.matchType, 'EXACT');

    const resultMissing = await judgeSpellingAttempt('cat', 'cat c a t', 'J1');
    assert.equal(resultMissing.correct, false);
    assert.equal(resultMissing.matchType, 'INVALID_SEQUENCE');
  } finally {
    CONFIG.OLLAMA_URL = originalUrl;
  }
});
