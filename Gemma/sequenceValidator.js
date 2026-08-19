// sequenceValidator.js
// Validador estrutural e fonético das regras oficiais de Spelling Bee.
// Implementa as regras do POP:
// 1. Regra dos 3 Passos (Say the word -> Spell letters -> Say the word again)
// 2. Regra de Letras Duplas ("DOUBLE P", "TWO P", "P P")
// 3. Regra de Delimitadores e Espaços (SPACE, BLANK, APOSTROPHE, HYPHEN)
// 4. Mapeamento de Pares Fonéticos e Tolerância Acústica STT

export const SPELLING_DELIMITERS = new Set([
  'SPACE', 'BLANK', 'ESPACE', 'PLACE', 'PACE',
  'APOSTROPHE', 'QUOTE', 'QUOTES', 'HYPHEN', 'DASH', 'PERIOD', 'COMMA'
]);

export const LETTER_NAMES = {
  'A': 'A', 'EY': 'A', 'AY': 'A',
  'B': 'B', 'BEE': 'B', 'BE': 'B',
  'C': 'C', 'CEE': 'C', 'SEE': 'C', 'SEA': 'C',
  'D': 'D', 'DEE': 'D',
  'E': 'E', 'EE': 'E',
  'F': 'F', 'EFF': 'F', 'EF': 'F',
  'G': 'G', 'GEE': 'G',
  'H': 'H', 'AITCH': 'H', 'HACH': 'H',
  'I': 'I', 'EYE': 'I',
  'J': 'J', 'JAY': 'J',
  'K': 'K', 'KAY': 'K',
  'L': 'L', 'EL': 'L', 'ELL': 'L',
  'M': 'M', 'EM': 'M',
  'N': 'N', 'EN': 'N', 'AND': 'N',
  'O': 'O', 'OH': 'O',
  'P': 'P', 'PEE': 'P', 'PE': 'P',
  'Q': 'Q', 'CUE': 'Q', 'QUEUE': 'Q',
  'R': 'R', 'AR': 'R', 'ARE': 'R',
  'S': 'S', 'ESS': 'S', 'ES': 'S',
  'T': 'T', 'TEE': 'T', 'TEA': 'T',
  'U': 'U', 'YOU': 'U',
  'V': 'V', 'VEE': 'V',
  'W': 'W', 'DOUBLE YOU': 'W', 'DOUBLEYOU': 'W',
  'X': 'X', 'EX': 'X',
  'Y': 'Y', 'WHY': 'Y',
  'Z': 'Z', 'ZEE': 'Z', 'ZED': 'Z'
};

export const ACOUSTIC_CONFUSION_PAIRS = [
  ['P', 'B'],
  ['M', 'N'],
  ['C', 'S'],
  ['T', 'D'],
  ['F', 'V'],
  ['K', 'C'],
  ['S', 'Z']
];

export function isAcousticallyEquivalent(c1, c2) {
  if (!c1 || !c2) return false;
  if (c1 === c2) return true;
  for (const [a, b] of ACOUSTIC_CONFUSION_PAIRS) {
    if ((c1 === a && c2 === b) || (c1 === b && c2 === a)) return true;
  }
  return false;
}

export function isSpellingToken(t) {
  if (!t) return false;
  const up = t.toUpperCase();
  if (SPELLING_DELIMITERS.has(up)) return true;
  if (up === 'DOUBLE' || up === 'TWO') return true;
  if (up.startsWith('DOUBLE') && up.length > 6) return true;
  if (LETTER_NAMES[up] && up.length <= 4) return true;
  if (up.length === 1 && /[A-Z]/.test(up)) return true;
  return false;
}

export function parseTokensToLetters(tokens) {
  if (!tokens || !tokens.length) return '';
  let letters = [];
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i].toUpperCase();
    const nextToken = (tokens[i + 1] || '').toUpperCase();

    if (SPELLING_DELIMITERS.has(token)) {
      i++;
      continue;
    }

    if ((token === 'DOUBLE' || token === 'TWO') && nextToken) {
      if (nextToken === 'YOU' || nextToken === 'U') {
        letters.push('W');
        i += 2;
        continue;
      }
      const mapped = LETTER_NAMES[nextToken] || (nextToken.length === 1 ? nextToken : null);
      if (mapped) {
        letters.push(mapped, mapped);
        i += 2;
        continue;
      }
    }

    if (token.startsWith('DOUBLE') && token.length > 6) {
      const rest = token.slice(6);
      if (rest === 'YOU' || rest === 'U') {
        letters.push('W');
        i++;
        continue;
      }
      const mapped = LETTER_NAMES[rest] || (rest.length === 1 ? rest : null);
      if (mapped) {
        letters.push(mapped, mapped);
        i++;
        continue;
      }
    }

    const mapped = LETTER_NAMES[token];
    if (mapped) {
      letters.push(mapped);
    } else if (token.length === 1 && /[A-Z]/.test(token)) {
      letters.push(token);
    }
    i++;
  }

  return letters.join('');
}

/**
 * Valida a tentativa de acordo com as regras de Spelling Bee.
 * Retorna resultado detalhado com garantia estrita da regra dos 3 passos.
 */
export function validateSpellingStructure(targetWord, transcriptRaw) {
  const target = targetWord.toUpperCase().trim();
  const targetLetters = target.replace(/[^A-Z]/g, '');
  const targetWords = target.replace(/[^A-Z\s]/g, '').split(/\s+/).filter(Boolean);
  const targetPhrase = targetWords.join(' ');

  const rawTokens = transcriptRaw.trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (!rawTokens.length) {
    return {
      correct: false,
      matchType: 'NONE',
      heard: '',
      explanation: 'No speech detected.',
      confidence: 0
    };
  }

  // Busca janela contínua de tokens de soletração que corresponda às letras do alvo
  let bestMatch = null;

  for (let startIdx = 0; startIdx < rawTokens.length; startIdx++) {
    if (!isSpellingToken(rawTokens[startIdx])) continue;

    for (let endIdx = startIdx + 1; endIdx <= rawTokens.length; endIdx++) {
      if (!isSpellingToken(rawTokens[endIdx - 1])) continue;

      const windowTokens = rawTokens.slice(startIdx, endIdx);
      const windowLetters = parseTokensToLetters(windowTokens);

      if (windowLetters === targetLetters) {
        bestMatch = {
          startIdx,
          endIdx,
          windowLetters,
          prefixTokens: rawTokens.slice(0, startIdx),
          suffixTokens: rawTokens.slice(endIdx),
          exact: true
        };
        break;
      }
    }
    if (bestMatch && bestMatch.exact) break;
  }

  // Se não encontrou janela exata, avalia confusão acústica ou erro nas letras
  if (!bestMatch && rawTokens.length >= 3) {
    const prefix = rawTokens[0];
    const suffix = rawTokens[rawTokens.length - 1];
    const middleTokens = rawTokens.slice(1, rawTokens.length - 1);
    const middleLetters = parseTokensToLetters(middleTokens);

    if (middleLetters.length > 0) {
      let mismatches = 0;
      if (middleLetters.length === targetLetters.length) {
        for (let i = 0; i < targetLetters.length; i++) {
          if (middleLetters[i] !== targetLetters[i]) {
            if (!isAcousticallyEquivalent(middleLetters[i], targetLetters[i])) {
              mismatches++;
            }
          }
        }
      } else {
        mismatches = 99;
      }

      bestMatch = {
        startIdx: 1,
        endIdx: rawTokens.length - 1,
        windowLetters: middleLetters,
        prefixTokens: [prefix],
        suffixTokens: [suffix],
        exact: mismatches === 0,
        confusable: mismatches === 0
      };
    }
  }

  if (bestMatch) {
    const hasOpeningWord = bestMatch.prefixTokens.length > 0;
    const hasClosingWord = bestMatch.suffixTokens.length > 0;
    const formattedHeard = bestMatch.windowLetters.split('').join('-');

    // REGRA 1: Checagem estrita da regra dos 3 passos
    if (!hasOpeningWord && !hasClosingWord) {
      return {
        correct: false,
        matchType: 'INVALID_SEQUENCE',
        heard: formattedHeard,
        explanation: 'Follow the 3-step rule: 1. Say the word, 2. Spell it, 3. Say the word again!',
        confidence: 1.0
      };
    }

    if (!hasOpeningWord) {
      return {
        correct: false,
        matchType: 'INVALID_SEQUENCE',
        heard: formattedHeard,
        explanation: `Remember to say '${targetWord}' before spelling!`,
        confidence: 1.0
      };
    }

    if (!hasClosingWord) {
      return {
        correct: false,
        matchType: 'INVALID_SEQUENCE',
        heard: formattedHeard,
        explanation: `Remember to say '${targetWord}' again after spelling!`,
        confidence: 1.0
      };
    }

    // Ambas as palavras de abertura e fechamento estão presentes
    if (bestMatch.exact || bestMatch.confusable) {
      const prefixText = bestMatch.prefixTokens.join(' ');
      const suffixText = bestMatch.suffixTokens.join(' ');
      const isExactPrefix = prefixText === targetPhrase || isAcousticallyEquivalent(prefixText, targetPhrase);
      const isExactSuffix = suffixText === targetPhrase || isAcousticallyEquivalent(suffixText, targetPhrase);

      if (isExactPrefix && isExactSuffix && bestMatch.exact) {
        return {
          correct: true,
          matchType: 'EXACT',
          heard: formattedHeard,
          explanation: 'Perfect 3-step spelling!',
          confidence: 1.0
        };
      } else {
        return {
          correct: true,
          matchType: 'AMBIGUOUS',
          heard: formattedHeard,
          explanation: 'Great job! Spelled correctly despite microphone noise.',
          confidence: 0.95
        };
      }
    } else {
      return {
        correct: false,
        matchType: 'NONE',
        heard: formattedHeard,
        explanation: 'The spelled letters did not match.',
        confidence: 1.0
      };
    }
  }

  // Fallback caso não seja reconhecido
  const allSpelled = parseTokensToLetters(rawTokens);
  return {
    correct: false,
    matchType: 'NONE',
    heard: allSpelled ? allSpelled.split('').join('-') : rawTokens.join(' '),
    explanation: 'Could not recognize the spelling.',
    confidence: 1.0
  };
}
