// ollamaClient.js
// Isola toda a comunicação com o Ollama e garante conformidade estrita com
// as regras do Spelling Bee (3 Passos, Letras Duplas, Delimitadores, Tolerância Acústica).

import { CONFIG, VALIDATION_RESPONSE_SCHEMA } from './config.js';
import { buildSpellingJudgePrompt } from './promptBuilder.js';
import { validateSpellingStructure } from './sequenceValidator.js';

/**
 * Chama o Gemma via Ollama para julgar uma tentativa de soletração.
 * Garante que nenhuma alucinação do modelo fira as regras do Spelling Bee.
 */
export async function judgeSpellingAttempt(targetWord, transcriptRaw, level = 'J1') {
  // 1. Validação estrutural rigorosa das regras oficiais (POP)
  const structuralVerdict = validateSpellingStructure(targetWord, transcriptRaw);

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
        format: VALIDATION_RESPONSE_SCHEMA,
        keep_alive: '60m',
        options: {
          temperature: 0.0,
          num_thread: 14,
          num_ctx: 384,
          num_predict: 70,
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

    // 2. Trava 1 (Antialucinação Positiva):
    // Se a regra dos 3 passos foi violada estruturalmente (ex: faltou palavra no início ou no fim),
    // NUNCA aceitar como correto.
    if (!structuralVerdict.correct && structuralVerdict.matchType === 'INVALID_SEQUENCE') {
      return {
        correct: false,
        matchType: 'INVALID_SEQUENCE',
        heard: structuralVerdict.heard || parsed.heard,
        explanation: structuralVerdict.explanation || parsed.explanation,
        confidence: 1.0,
      };
    }

    // 3. Trava 2 (Antialucinação Negativa):
    // Se todos os 3 passos foram cumpridos e as letras conferem (ex: tolerância a ruído de STT tipo "have here"),
    // e o modelo erroneamente marcou INVALID_SEQUENCE, reconciliar para AMBIGUOUS.
    if (structuralVerdict.correct && (structuralVerdict.matchType === 'EXACT' || structuralVerdict.matchType === 'AMBIGUOUS')) {
      if (!parsed.correct || parsed.matchType === 'INVALID_SEQUENCE' || parsed.matchType === 'NONE') {
        return structuralVerdict;
      }
    }

    return {
      correct: parsed.correct,
      matchType: parsed.matchType,
      heard: parsed.heard || structuralVerdict.heard,
      explanation: parsed.explanation || structuralVerdict.explanation,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 1.0,
    };
  } catch (err) {
    // Se o Ollama estiver offline ou der timeout, usa o veredito estrutural nativo de alta precisão
    if (err.name === 'AbortError' || err.message?.includes('fetch') || err.message?.includes('ECONNREFUSED')) {
      console.warn(`[ollamaClient] ⚡ Fallback para validação estrutural nativa (${err.message || err.name})`);
      return structuralVerdict;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
