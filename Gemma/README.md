# Spelling Validator Service

Microsserviço que recebe o texto transcrito no navegador (Web Speech API) e devolve
um julgamento estruturado usando o Gemma via Ollama. É o "cérebro" da Fase 3 do
plano: fica na mesma máquina/rede do Ollama, não guarda estado, não tem banco.

## Como rodar

```bash
npm install
cp .env.example .env   # ajuste ALLOWED_ORIGIN pro domínio real do app
node --env-file=.env server.js
```

Se o Node da sua máquina for anterior à 20.6 (sem `--env-file`), exporte as
variáveis do `.env.example` via shell, `pm2` ou `systemd` antes de rodar
`node server.js`.

Confirme que o Ollama já está de pé e com o modelo baixado:
```bash
ollama pull gemma4:12b-it-q4_K_M
curl http://localhost:8787/health
```

## Endpoint

`POST /api/v1/validate-spelling`

Request:
```json
{ "targetWord": "house", "transcriptRaw": "house h o u s e house", "level": "J1" }
```

Resposta em caso de sucesso (200):
```json
{
  "correct": true,
  "matchType": "AMBIGUOUS",
  "heard": "H-O-U-S-E",
  "explanation": "Great job, just a tiny mix-up between similar sounding letters.",
  "confidence": 0.87
}
```
`matchType` sempre vem em `EXACT | AMBIGUOUS | INVALID_SEQUENCE | NONE`, o mesmo
enum que a função `evaluateSpellingBeeSequence` já usa hoje no frontend. Isso é
proposital: o adapter da Fase 2 só precisa mapear esse JSON pro formato interno,
sem exigir nenhuma mudança na renderização que já existe.

Qualquer falha (payload inválido, Ollama fora do ar, timeout, JSON malformado do
modelo) responde com status diferente de 200 e um corpo padronizado, por exemplo:
```json
{ "error": "validation_unavailable", "reason": "ollama_timeout" }
```
O frontend trata isso como sinal único: "usa o avaliador local". Não expõe stack
trace nem detalhe interno pro cliente.

## O que já foi testado neste ambiente

Sem acesso a um Ollama real aqui, simulei os três cenários que importam:

1. **Payload inválido** (`targetWord` ausente, transcript acima do limite) → `400`,
   sem chegar a chamar o Ollama.
2. **Ollama fora do ar** (porta fechada) → `504` em ~90ms, servidor segue de pé,
   `/health` responde normalmente depois.
3. **Ollama lento** (mock que demora 10s pra responder) → o `AbortController`
   corta em exatamente 4s (`OLLAMA_TIMEOUT_MS`), nunca deixa a requisição pendurada.
4. **Caminho feliz** (mock respondendo rápido e no formato certo) → `200` com o
   JSON mapeado corretamente, e confirmei que o `format` (JSON Schema) e o
   `model` corretos chegam na chamada ao Ollama.

Antes de ir pra produção, falta só o teste com o Ollama real e o modelo
`gemma4:12b-it-q4_K_M` de fato carregado, pra validar latência real na GPU e
a qualidade dos julgamentos do prompt.

## Estrutura

- `server.js`: rotas, validação de input, controle de concorrência.
- `ollamaClient.js`: única fonte de verdade pra falar com o Ollama (troca de
  modelo/host/motor de inferência muda só aqui).
- `promptBuilder.js`: o prompt do juiz, isolado pra poder iterar sem tocar
  em rede/timeout.
- `config.js`: todas as envs e o JSON Schema da resposta, num lugar só.

## Próximo passo

Fase 2: o adapter no frontend (`SpellingValidationAdapter`) que chama esse
endpoint, faz a corrida contra o timeout, e cai no `evaluateSpellingBeeSequence`
local se qualquer coisa aqui falhar.
