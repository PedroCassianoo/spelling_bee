// config.js
// Configuracao central do microsservico. Tudo pode ser sobrescrito por env vars,
// com defaults seguros para rodar local, do lado do Ollama, sem setup extra.

export const CONFIG = {
  PORT: process.env.PORT || 8787,

  // Endereco do Ollama na mesma maquina/rede da GPU/CPU.
  OLLAMA_URL: process.env.OLLAMA_URL || 'http://localhost:11434',
  MODEL_NAME: process.env.GEMMA_MODEL || 'gemma2:2b',

  // Origem(ns) permitida(s) para CORS. Em producao, trocar '*' pelo dominio real
  // onde o index.html do Spelling Bee esta hospedado.
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || '*',

  // Orcamento de tempo para a chamada ao Gemma (6s). Bate com o timeout do frontend.
  OLLAMA_TIMEOUT_MS: Number(process.env.OLLAMA_TIMEOUT_MS || 6000),

  // Protege a GPU de ficar sobrecarregada com a turma toda testando ao mesmo tempo.
  // Acima disso, o servico responde 503 na hora (sem fila de espera) e o
  // frontend cai no fallback local, sem travar o aluno esperando.
  MAX_CONCURRENT_REQUESTS: Number(process.env.MAX_CONCURRENT_REQUESTS || 4),

  // Limites de tamanho de input, protecao basica contra abuso/prompt injection.
  MAX_WORD_LENGTH: 40,
  MAX_TRANSCRIPT_LENGTH: 300,
};

// Schema JSON passado no campo "format" da chamada ao Ollama.
// Isso forca o Gemma a devolver sempre um JSON valido nesse formato exato,
// eliminando a necessidade de parsing fragil por regex no backend.
export const VALIDATION_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    correct: { type: 'boolean' },
    matchType: {
      type: 'string',
      enum: ['EXACT', 'AMBIGUOUS', 'INVALID_SEQUENCE', 'NONE'],
    },
    heard: { type: 'string' },
    explanation: { type: 'string' },
    confidence: { type: 'number' },
  },
  required: ['correct', 'matchType', 'heard', 'explanation', 'confidence'],
};
