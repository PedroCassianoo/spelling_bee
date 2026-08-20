# 📋 Registro de Alterações e Correções de Erros (Changelog / Log)

Projeto: **Spelling Bee Contest - Red Balloon Paulínia**  
Diretório: `C:\Projetos Gemini\Red News`

---

## 🛠️ Últimas Correções de Erros e Implementações

### [2026-08-19] - Plano 1 & Plano 2: Logger de Candidatos e Painel de Curadoria Humana com Sincronização Dinâmica

- **Objetivo:**
  - Criar um loop fechado completo para aprendizado contínuo de variações do Web Speech API:
    1. **Plano 1 (Captura Silenciosa):** Detecção automática de soletrações corretas com menções de palavras pré/pós desconhecidas e log via RPC Supabase com Security Definer (`log_variant_candidate`).
    2. **Plano 2 (Curadoria Humana & Merge Dinâmico):** Painel administrativo isolado ([admin-variantes.html](file:///c:/Projetos%20Gemini/Red%20News/admin-variantes.html)) para aprovação/rejeição humana com Supabase Auth e função `loadApprovedVariants()` que carrega as variantes aprovadas da tabela `word_phonetic_variants` no boot do app do aluno sem modificar o seed local estático.

- **Ações e Entregáveis:**
  - ✅ **Script SQL Plano 1 ([supabase_plano_1.sql](file:///c:/Projetos%20Gemini/Red%20News/supabase_plano_1.sql)):** Tabela `word_variant_candidates`, índice por status, RLS restritivo e função RPC `log_variant_candidate` com agregação por `occurrence_count`.
  - ✅ **Script SQL Plano 2 ([supabase_plano_2.sql](file:///c:/Projetos%20Gemini/Red%20News/supabase_plano_2.sql)):** Tabela `word_phonetic_variants`, políticas RLS para leitura pública e leitura de curadores autenticados, RPCs `approve_variant_candidate` e `reject_variant_candidate`.
  - ✅ **Aprimoramento do Validador ([spellingBeeValidator.js](file:///c:/Projetos%20Gemini/Red%20News/Gemma/spellingBeeValidator.js) e [index.html](file:///c:/Projetos%20Gemini/Red%20News/index.html)):** Adicionado suporte a `details` no retorno de `validateSpelling`, funções assíncronas `validateSpellingAndLog()` e `loadApprovedVariants()` integradas de forma não-bloqueante.
  - ✅ **Painel de Curadoria Pro ([admin-variantes.html](file:///c:/Projetos%20Gemini/Red%20News/admin-variantes.html)):** Interface dedicada com autenticação Supabase Auth, cards de KPI em tempo real, abas de triagem (Pendentes, Aprovadas, Rejeitadas, Dicionário Ativo), ordenação por frequência de erro, inserção manual e simulador sandbox de transcrições.
  - ✅ **Suíte de Testes Automatizados ([test_logger_candidate.js](file:///c:/Projetos%20Gemini/Red%20News/Gemma/test_logger_candidate.js) e [test_plan_2.js](file:///c:/Projetos%20Gemini/Red%20News/Gemma/test_plan_2.js)):** 100% de cobertura com todos os testes passando com sucesso.

---

### [2026-08-19] - Conformidade Estrita com Regras Oficiais do Spelling Bee (Regra dos 3 Passos: Say -> Spell -> Say)

- **Identificação do Problema:**
  1. **Aprovação Indevida de Soletrações sem Repetição Final:** Alunos que apenas falavam a palavra e soletravam as letras (ex: `"cat c a t"` ou `"have here h e a v i e r"`) sem repetir a palavra no final estavam sendo aprovados com `EXACT` ou `AMBIGUOUS` (+10 pts), violando a regra central dos 3 passos do Spelling Bee.
  2. **Ausência de Trava Antialucinação no Backend Gemma:** O prompt anterior permitia que o modelo LLM relevasse a ausência da palavra de fechamento caso as letras centrais estivessem corretas.
  3. **Fallback Local no Frontend:** A função `evaluateSpellingBeeSequence` no `index.html` possuía ramificação que aceitava sequências com tokens >= 3 sem validar os limites inicial e final de forma estrita.

- **Ações e Correções Aplicadas:**
  - ✅ **Módulo de Validação Estrutural e Fonética ([sequenceValidator.js](file:///c:/Projetos%20Gemini/Red%20News/Gemma/sequenceValidator.js)):** Criação de validador determinístico para as 4 regras do POP (3 Passos, Letras Duplas `DOUBLE`/`TWO`, Delimitadores `SPACE`/`APOSTROPHE` e Matriz de Confusão Fonética).
  - ✅ **Prompt Estruturado com Exemplos Negativos ([promptBuilder.js](file:///c:/Projetos%20Gemini/Red%20News/Gemma/promptBuilder.js)):** Instruções imperativas para o Gemma exigindo que tentativas sem palavra no início ou sem palavra no fim retornem obrigatoriamente `INVALID_SEQUENCE` com `correct: false`.
  - ✅ **Travas de Segurança Antialucinação no Cliente Ollama ([ollamaClient.js](file:///c:/Projetos%20Gemini/Red%20News/Gemma/ollamaClient.js)):** Reconciliação bidirecional que impede que o LLM marque como correto qualquer tentativa que viole a regra dos 3 passos, e impede falsos negativos em ruídos acústicos de STT com os 3 passos presentes.
  - ✅ **Alinhamento do Motor Local no Frontend ([index.html](file:///c:/Projetos%20Gemini/Red%20News/index.html)):** Atualização de `parseTokensToLetters` e `evaluateSpellingBeeSequence` para exigir abertura, soletração e fechamento com tolerância acústica padronizada.
  - ✅ **Suíte de Testes Automatizados 100% Coberta ([test.js](file:///c:/Projetos%20Gemini/Red%20News/Gemma/test.js)):** 8 suítes de testes unitários cobrindo todos os cenários das regras do POP com 100% de aprovação.

---

### [2026-08-18] - Otimização de Performance Gemma (CPU sub-2s), Tolerância Acústica STT e Live Logs

- **Identificação do Problema:**
  1. **Gargalo de Latência no Modelo 12B:** O modelo de 12B no Ollama executando em CPU (AMD Ryzen 7 5700G) levava ~33s para responder (largura de banda DDR4), estourando o timeout de 4s e forçando o fallback local em todas as tentativas.
  2. **Erro Acústico de STT no Navegador (*have here* vs *heavier*):** Ao falar *"heavier"* ou soletrações, o Google STT no Chrome transcrevia a locução como expressões comuns de conversação em inglês (*"have here"*). O avaliador local reprovava por não reconhecer a palavra no início/fim, mesmo com as letras do miolo 100% corretas.
  3. **Ausência de Logs no Terminal:** O microsserviço [server.js](file:///c:/Projetos%20Gemini/Red%20News/Gemma/server.js) não exibia os dados recebidos e enviados em requisições de sucesso, dificultando a auditoria.

- **Ações e Correções Aplicadas:**
  - ✅ **Otimização Extrema de Parâmetros CPU:** Configurado `num_thread: 14`, `num_ctx: 256`, `num_predict: 45`, `temperature: 0` e prompt ultra-compacto no [promptBuilder.js](file:///c:/Projetos%20Gemini/Red%20News/Gemma/promptBuilder.js), reduzindo o tempo de leitura do prompt de 11s para <0.2s e viabilizando inferência ágil.
  - ✅ **Suporte ao Modelo Leve `gemma2:2b`:** Adicionado suporte nativo e chaveamento de modelo para execução em CPU com tempo de resposta de 1 a 2 segundos.
  - ✅ **Tolerância a Ruído de STT no Avaliador Local e na IA:** Instruções explícitas no prompt da IA e lógica aprimorada no [index.html](file:///c:/Projetos%20Gemini/Red%20News/index.html) para identificar quando as letras soletradas no miolo (`H-E-A-V-I-E-R`) estão 100% corretas, aceitando ruídos do navegador nas bordas como `AMBIGUOUS` (+10 pts) em vez de dar tela de erro.
  - ✅ **Live Logging em Tempo Real no Servidor:** Inclusão de logs coloridos com timestamp, tempo em milissegundos, payload do STT, veredito e explicação amigável no [server.js](file:///c:/Projetos%20Gemini/Red%20News/Gemma/server.js).
  - ✅ **Aumento de Timeout Seguro:** Ajustado timeout para 6.000ms no [config.js](file:///c:/Projetos%20Gemini/Red%20News/Gemma/config.js) e no [index.html](file:///c:/Projetos%20Gemini/Red%20News/index.html).

---

### [2026-08-17] - POP: Revisão Fonética, Áudio e Validação de "There aren't" (J2)

- **Identificação do Problema:**
  1. **Áudio de Locução Incompleto:** No banco de dados (`insert_words_j2.sql` e `insert_words.sql`), o termo `"there aren't"` apontava para `there-us.mp3`, reproduzindo apenas a palavra `"there"` em vez da locução completa.
  2. **Tratamento de Pontuação e Espaços na Soletração:** Alunos que pronunciavam `T - H - E - R - E [space] A - R - E - N - apostrophe - T` tinham os tokens `"SPACE"` e `"APOSTROPHE"` interpretados como letras individuais se falados em voz alta.
  3. **Validação de Frases e Expressões Compostas:** A validação de sequência nos limites inicial e final assumia apenas 1 token isolado e comparava com caracteres literais de pontuação, gerando falha em expressões compostas e contrações.

- **Ações e Correções Aplicadas:**
  - ✅ **Áudio 100% Completo:** Ajustado `audio_url = ''` para expressões compostas no SQL, ativando a síntese de voz nativa (`window.speechSynthesis`) em *en-US* para pronunciar a frase inteira `"There aren't."` perfeitamente.
  - ✅ **Filtro de Delimitadores de Soletração:** Adicionado suporte a `SPELLING_DELIMITER_TOKENS` (`SPACE`, `APOSTROPHE`, `QUOTE`, `HYPHEN`, `DASH`, `PERIOD`, `COMMA`) para ignorar palavras delimitadoras sem convertê-las em letras erradas.
  - ✅ **Normalização de Expressões no Reconhecimento:** A engine agora extrai e compara as letras puras do alvo (`"THEREARENT"`), aceitando soletrações com ou sem pontuação falada.
  - ✅ **Formatação Visual Perfeita:** A exibição formatada separa palavras por espaçamento largo (`T-H-E-R-E   A-R-E-N-'-T`) mantendo a estética Red Balloon / Spelling Bee.
  - ✅ **Vocabulary Biasing Expandido:** Injeção automática das palavras da expressão, letras individuais, `DOUBLE`, `SPACE` e `APOSTROPHE` no `SpeechGrammarList`.

---

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

### [2026-08-19] - Módulo de Validação Fonética Pura no Spelling Bee (SpellingBeeValidator)

- **Objetivo:**
  - Integrar a arquitetura em 4 camadas de validação fonética pura (`SpellingBeeValidator`) no aplicativo single-file `index.html`.
- **Ações Realizadas:**
  - ✅ **Backup de Segurança:** Criado `index.backup.html`.
  - ✅ **Módulo Isolado:** Inserido `SpellingBeeValidator` em bloco `<script>` próprio antes do script principal, contendo sanitização, dicionário fonético de 26 letras, resolução de multiplicadores (`double`/`triple`), delimitador `space`, classificação de menção (`classifyWordMention`) e orquestrador (`validateSpelling`).
  - ✅ **Integração sem Quebras:** Atualizada a função `evaluateSpellingBeeSequence` para chamar `SpellingBeeValidator.validateSpelling(targetWord, primaryRaw)` preservando todas as assinaturas e sem remover variáveis/funções legadas.
  - ✅ **Testes de Regressão:** 14/14 casos de teste automatizados validados com 100% de sucesso.

