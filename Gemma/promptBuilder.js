// promptBuilder.js
// Responsabilidade unica: montar o prompt do juiz de Spelling Bee.
// Fica isolado do server.js de proposito, para poder iterar no texto do
// prompt (tom, regras, exemplos) sem mexer em rede/timeout/concorrencia.

/**
 * @param {string} targetWord   Palavra alvo que o aluno deveria soletrar.
 * @param {string} transcriptRaw  Texto cru devolvido pela Web Speech API no browser.
 * @param {string} level  Nivel do aluno (J1, J2, T1, T2), usado so como contexto de tom.
 */
export function buildSpellingJudgePrompt(targetWord, transcriptRaw, level) {
  return `You are a Spelling Bee judge for kids (level ${level}).
Student rule: Say the word, spell it letter by letter, and say the word again.
Note: Speech-to-text (STT) frequently mishears spoken words as English phrases (e.g. 'have here' for 'heavier', 'star' for 'start'). If the spelled letters match the target, mark AMBIGUOUS with correct=true.

Example 1:
TARGET: "cat"
TRANSCRIPT: "cat c a t cat"
Result: {"correct": true, "matchType": "EXACT", "heard": "C-A-T", "explanation": "Perfect spelling!", "confidence": 1.0}

Example 2:
TARGET: "heavier"
TRANSCRIPT: "have here h e a v i e r have here"
Result: {"correct": true, "matchType": "AMBIGUOUS", "heard": "H-E-A-V-I-E-R", "explanation": "Great job! Spelled correctly despite mic noise.", "confidence": 1.0}

Now judge this attempt:
TARGET: "${targetWord}"
STUDENT'S STT TRANSCRIPT: "${transcriptRaw}"

Respond ONLY with the JSON object matching the required schema.`;
}
