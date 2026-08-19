// ollamaClient.js
// Isola toda a comunicacao com o Ollama. Se amanha vocês trocarem de modelo,
// de host, ou ate de motor de inferencia, so esse arquivo muda.

import { CONFIG, VALIDATION_RESPONSE_SCHEMA } from './config.js';
import { buildSpellingJudgePrompt } from './promptBuilder.js';

/**
 * Chama o Gemma via Ollama para julgar uma tentativa de soletracao.
 * Lanca erro em caso de timeout, falha de rede, HTTP nao-ok, ou JSON invalido/incompleto,
 * para que o caller (server.js) decida o que responder ao frontend.
 */
export async function judgeSpellingAttempt(targetWord, transcriptRaw, level) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.OLLAMA_TIMEOUT_MS);

  try {
    const response = await fetch(`${CONFIG.OLLAMA_URL}/api/generate`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CONFIG.MODEL_NAME,
        prompt: buildSpellingJudgePrompt(targetWord, transcriptRaw, level),
        stream: false,
        format: VALIDATION_RESPONSE_SCHEMA, // forca JSON valido no schema certo
        keep_alive: '60m', // mantem o modelo quente na memoria entre chamadas
        options: {
          temperature: 0.0, // deterministico e mais rapido
          num_thread: 14, // otimizado para os 16 threads do Ryzen 7
          num_ctx: 256, // reduz alocacao de memoria e acelera prompt eval
          num_predict: 45, // resposta concisa, latencia ultra-baixa
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`ollama_http_${response.status}`);
    }

    const data = await response.json();
    const parsed = JSON.parse(data.response);

    if (
      typeof parsed.correct !== 'boolean' ||
      typeof parsed.matchType !== 'string' ||
      typeof parsed.heard !== 'string' ||
      typeof parsed.explanation !== 'string'
    ) {
      throw new Error('malformed_llm_response');
    }

    return {
      correct: parsed.correct,
      matchType: parsed.matchType,
      heard: parsed.heard,
      explanation: parsed.explanation,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
