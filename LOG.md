# 📋 Registro de Alterações e Correções de Erros (Changelog / Log)

Projeto: **Spelling Bee Contest - Red Balloon Paulínia**  
Diretório: `C:\Projetos Gemini\Red News`

---

## 🛠️ Últimas Correções de Erros (Bug Fixes)

### [2026-08-17] - Correção Crítica de Vazamento da Palavra no Modo Reconhecimento de Voz (Voice Screen)

- **Identificação do Erro:**
  - No Modo Voice (Reconhecimento de Voz), a palavra que o usuário deveria soletrar estava sendo exposta/spoiler na tela em três momentos distintos:
    1. **Durante a escuta ativa (`onstart`):** O elemento exibia `"Listening... Say it like this: WORD, W-O-R-D, WORD"`, entregando a resposta antes do participante falar.
    2. **Em sequência inválida (`INVALID_SEQUENCE`):** Ao não falar a palavra no início e no fim, exibia `"Try saying: WORD, W-O-R-D, WORD"`.
    3. **Em erro de soletração:** Ao errar a palavra, o balão de erro mostrava a palavra correta e sua soletração completa.
    4. **Exemplo visual estático:** Apresentava exemplo que podia gerar confusão no card.

- **Ações e Correções Aplicadas (`index.html`):**
  - ✅ **Remoção do Spoiler na Escuta:** Substituída a mensagem durante a escuta para `"Listening... Say the word, spell it, and say it again!"`, ocultando a palavra alvo.
  - ✅ **Remoção do Spoiler na Sequência Inválida:** Alterada a mensagem para focar na regra de 3 passos sem exibir a palavra: `"1. Say the word • 2. Spell it letter by letter • 3. Say the word again"` + transcrição do que foi capturado pelo microfone.
  - ✅ **Remoção do Spoiler no Erro:** Mensagem ajustada para encorajar nova tentativa com foco auditivo (`"Listen to the pronunciation and try again."`) sem revelar o gabarito.
  - ✅ **Padronização do Exemplo Visual:** Card atualizado com exemplo neutro (`"Star, S-T-A-R, Star"`).
  - ✅ **Reset de Estado no Card de Voz:** Inclusão de chamada a `resetVoiceCard()` na troca de abas (`switchGameMode('voice')`) e limpeza do feedback anterior.

---

## 📜 Histórico de Implementações e Correções Anteriores

### [2026-08-17] - Sincronização de Estrutura de Projeto e Repositório
- **Ajustes:**
  - Padronização do caminho do projeto em `C:\Projetos Gemini\Red News`.
  - Configuração do repositório Git (`origin https://github.com/PedroCassianoo/spelling_bee.git`).
  - Sincronização de fontes locais Ambit (OpenType / TrueType) e scripts de automação PowerShell (`push_to_github.ps1`).
  - Integração com Vercel (`vercel.json`) e base de dados Supabase (`insert_words.sql`, `insert_words_j1.sql`, `insert_words_j2.sql`, `insert_words_t1.sql`, `insert_words_t2.sql`).

### [2026-08-17] - Engine Fonética e Regras de Spelling Bee
- **Ajustes:**
  - Implementação da validação da regra de 3 passos (*Word - Spelling - Word*).
  - Implementação de algoritmo de Distância de Levenshtein com Matriz de Confusão Fonética e tolerância acústica (*Vocabulary Biasing*).
  - Suporte a reconhecimento de letras duplas (*ex: "DOUBLE P"*).
  - Fallback de áudio: reprodução via URL remota de áudio com fallback automático para Text-to-Speech (`window.speechSynthesis`) nativo.
