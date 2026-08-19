// test.js
// Suite de testes automatizados para o microsservico de validacao Gemma
// Utiliza o test runner nativo do Node (node:test e node:assert)

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { CONFIG, VALIDATION_RESPONSE_SCHEMA } from './config.js';
import { buildSpellingJudgePrompt } from './promptBuilder.js';
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

test('promptBuilder: constructs prompt with target, transcript, and level', () => {
  const prompt = buildSpellingJudgePrompt('cat', 'cat c a t cat', 'J1');
  assert.match(prompt, /TARGET: "cat"/);
  assert.match(prompt, /STUDENT'S STT TRANSCRIPT: "cat c a t cat"/);
  assert.match(prompt, /level J1/);
  assert.match(prompt, /"EXACT"/);
  assert.match(prompt, /"AMBIGUOUS"/);
});

test('ollamaClient: parses valid response from mock Ollama', async () => {
  // Cria um servidor HTTP mock simulando o Ollama
  const mockServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const payload = JSON.parse(body);
      assert.equal(payload.model, CONFIG.MODEL_NAME);
      assert.ok(payload.format);
      
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
    const result = await judgeSpellingAttempt('cat', 'cat c a t cat', 'J1');
    assert.equal(result.correct, true);
    assert.equal(result.matchType, 'EXACT');
    assert.equal(result.heard, 'C-A-T');
    assert.equal(result.explanation, 'Awesome spelling!');
    assert.equal(result.confidence, 0.98);
  } finally {
    CONFIG.OLLAMA_URL = originalUrl;
    mockServer.close();
  }
});

test('ollamaClient: handles Ollama offline gracefully', async () => {
  const originalUrl = CONFIG.OLLAMA_URL;
  CONFIG.OLLAMA_URL = 'http://localhost:59999'; // Porta fechada

  try {
    await assert.rejects(
      async () => {
        await judgeSpellingAttempt('house', 'house h o u s e house', 'J1');
      }
    );
  } finally {
    CONFIG.OLLAMA_URL = originalUrl;
  }
});

test('ollamaClient: handles Ollama timeout (>4s)', async () => {
  const mockSlowServer = http.createServer((req, res) => {
    // Nao responde imediatamente, espera passar do timeout
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ response: '{}' }));
    }, 6000);
  });

  await new Promise(resolve => mockSlowServer.listen(0, resolve));
  const port = mockSlowServer.address().port;
  const originalUrl = CONFIG.OLLAMA_URL;
  const originalTimeout = CONFIG.OLLAMA_TIMEOUT_MS;
  
  CONFIG.OLLAMA_URL = `http://localhost:${port}`;
  CONFIG.OLLAMA_TIMEOUT_MS = 200; // timeout rapido para o teste

  try {
    await assert.rejects(
      async () => {
        await judgeSpellingAttempt('house', 'house', 'J1');
      },
      (err) => err.name === 'AbortError'
    );
  } finally {
    CONFIG.OLLAMA_URL = originalUrl;
    CONFIG.OLLAMA_TIMEOUT_MS = originalTimeout;
    mockSlowServer.close();
  }
});
