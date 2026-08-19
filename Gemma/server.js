// server.js
// Microsservico minimo: recebe texto do frontend, consulta o Gemma via Ollama,
// devolve JSON estruturado. Sem estado, sem banco, sem dependencia alem
// de express/cors. Roda na mesma maquina/rede do Ollama.

import express from 'express';
import cors from 'cors';
import { CONFIG } from './config.js';
import { judgeSpellingAttempt } from './ollamaClient.js';

const app = express();
app.use(cors({ origin: CONFIG.ALLOWED_ORIGIN }));
app.use(express.json({ limit: '10kb' })); // payload é so texto curto, 10kb sobra

// Contador simples de requisicoes em voo, protege a GPU de picos
// (ex: turma inteira testando ao mesmo tempo no contest).
let activeRequests = 0;

function validatePayload(body) {
  const { targetWord, transcriptRaw, level } = body || {};

  if (typeof targetWord !== 'string' || !targetWord.trim()) {
    return 'invalid_target_word';
  }
  if (targetWord.length > CONFIG.MAX_WORD_LENGTH) {
    return 'target_word_too_long';
  }
  if (typeof transcriptRaw !== 'string') {
    return 'invalid_transcript';
  }
  if (transcriptRaw.length > CONFIG.MAX_TRANSCRIPT_LENGTH) {
    return 'transcript_too_long';
  }
  if (level !== undefined && typeof level !== 'string') {
    return 'invalid_level';
  }
  return null;
}

app.post('/api/v1/validate-spelling', async (req, res) => {
  const t0 = Date.now();
  const validationError = validatePayload(req.body);
  if (validationError) {
    console.warn(`[validate-spelling] ❌ Payload invalido: ${validationError}`);
    return res.status(400).json({ error: validationError });
  }

  if (activeRequests >= CONFIG.MAX_CONCURRENT_REQUESTS) {
    console.warn(`[validate-spelling] ⚠️ Servidor ocupado (${activeRequests} em voo)`);
    return res.status(503).json({ error: 'server_busy' });
  }

  const { targetWord, transcriptRaw, level } = req.body;
  const target = targetWord.trim();
  const transcript = transcriptRaw.trim();
  const studentLevel = level || 'J1';

  activeRequests++;
  console.log(`\n==================================================`);
  console.log(`[REQ] 📥 Target: "${target}" | Raw STT: "${transcript}" | Level: ${studentLevel}`);

  try {
    const result = await judgeSpellingAttempt(target, transcript, studentLevel);
    const elapsed = Date.now() - t0;
    const statusIcon = result.correct ? '✅' : '❌';
    console.log(`[RES] 📤 (${elapsed}ms) ${statusIcon} [${result.matchType}] Correct: ${result.correct} | Heard: "${result.heard}"`);
    console.log(`      💬 "${result.explanation}" (conf: ${result.confidence})`);
    console.log(`==================================================\n`);
    return res.json(result);
  } catch (err) {
    const elapsed = Date.now() - t0;
    const reason = err.name === 'AbortError' ? 'ollama_timeout' : err.message;
    console.error(`[ERR] ❌ (${elapsed}ms) Falhou (${reason}):`, err.message || err);
    console.log(`==================================================\n`);
    return res.status(504).json({ error: 'validation_unavailable', reason });
  } finally {
    activeRequests--;
  }
});

// Healthcheck simples, util pra monitoramento e pra checar se o Ollama esta
// respondendo antes de liberar a feature no frontend.
app.get('/health', (req, res) => {
  res.json({ ok: true, activeRequests, model: CONFIG.MODEL_NAME });
});

app.listen(CONFIG.PORT, () => {
  console.log(`Spelling validator rodando na porta ${CONFIG.PORT}`);
  console.log(`Ollama alvo: ${CONFIG.OLLAMA_URL} | Modelo: ${CONFIG.MODEL_NAME}`);
});
