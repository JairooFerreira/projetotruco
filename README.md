# Projeto Truco

Plataforma de truco online multiplayer. Nome temporário, definido em um único lugar: `packages/config/src/app.ts`.

## Estado atual

Modo local. Implementado:

- **Motor de regras** (`packages/game-engine`): baralho de 40 cartas, manilhas, resolução de rodadas e de mãos, escada do truco (truco, seis, nove, doze) e placar. Visão por jogador que não expõe as cartas dos demais.
- **Servidor de mesas** (`packages/server`): WebSocket com criação e entrada por código, mesas de 4 jogadores, partida completa com placar de 12, reconexão ao mesmo assento e validação de mensagens. O servidor é a única autoridade sobre cartas, turnos e pontos.
- **Autenticação**: login com Google via Firebase Authentication. O servidor verifica o token de cada conexão; o cliente não escolhe o próprio uid. Modo de teste local com `AUTH_MODE=guest`, que avisa no log e não é autenticação.
- **Persistência**: PostgreSQL com migrações versionadas (`packages/server/migrations`) e escritas idempotentes para usuários, partidas e mãos. Sem `DATABASE_URL`, o histórico fica em memória.
- **Cliente web** servido em `/`: login, criar/entrar em mesa, jogar cartas, pedir e responder truco.
- **Testes**: 49 casos. Os testes de PostgreSQL rodam com `TEST_DATABASE_URL` apontando para um banco cujo nome contenha "test".

Ainda não implementado (etapas seguintes do documento de especificação):
- Ranking, XP e conquistas.
- Verificação real do token Firebase não foi testada de ponta a ponta: exige um projeto Firebase configurado. Os testes usam verificador injetado.
- Personagens, inventário cosmético, lobby com busca de adversários e salas privadas.
- Carteira, ledger e Pix. Permanecem desabilitados até validação jurídica e contratação de provedor autorizado.
- Painel administrativo e moderação.
- Design final do frontend (o atual é funcional, não o visual premium descrito).

Nada disso está simulado: o que não existe está ausente.

## Stack escolhida

| Camada | Escolha | Motivo |
|---|---|---|
| Linguagem | TypeScript em modo `strict`, com `noUncheckedIndexedAccess` | Erros de índice e de tipo pegos em compilação |
| Monorepo | npm workspaces | Sem ferramenta extra; regras isoladas do resto |
| Regras do jogo | Módulo puro (`game-engine`), sem I/O | Testável sem rede nem banco; o servidor é a única autoridade |
| Testes | Vitest | Rápido, nativo em TypeScript |
| Frontend (planejado) | Next.js + React + Tailwind | Renderização segura por padrão, boa performance em celular |
| Backend (planejado) | Node.js + Fastify + `ws` | Processo persistente para WebSockets, separado do frontend |
| Banco (planejado) | PostgreSQL com migrações versionadas | Ledger e auditoria exigem transações atômicas |
| Autenticação (planejado) | Firebase Auth com Google, tokens verificados no backend | Não armazena senha nem token no navegador |

## Como rodar

```bash
npm install
npm test          # 49 testes (+2 de PostgreSQL quando TEST_DATABASE_URL está definida)
npm run typecheck # verificação de tipos em todos os pacotes
AUTH_MODE=guest npm start --workspace @projeto-truco/server   # teste local em http://127.0.0.1:8080
```

Com `AUTH_MODE=guest`, abra quatro abas em `http://127.0.0.1:8080`, entre com nomes diferentes, crie uma mesa em uma e entre com o código nas outras. Para testar o histórico, defina também `DATABASE_URL`.

Veja `.env.example` para as variáveis. Produção exige `FIREBASE_PROJECT_ID`; sem ele e sem `AUTH_MODE=guest`, o servidor não inicia.

## Regras implementadas

- **Baralho:** 40 cartas, de 4 a 3, sem 8, 9 e 10. Ordem crescente: 4, 5, 6, 7, Q, J, K, A, 2, 3.
- **Manilha:** a carta seguinte à virada. Virada 3 → manilha 4. Virada 7 → manilha Q.
- **Ordem entre manilhas:** paus, copas, espadas, ouros. Configurável em `cards.ts`.
- **Empate de rodada:** cartas mais fortes de equipes diferentes com força igual. Se for do mesmo time, esse time vence.
- **Decisão da mão:** a primeira rodada decide; se empatar, decide a segunda; se as duas empatarem, decide a terceira; se tudo empatar, vence a equipe da mão.
- **Truco:** escada 1 → 3 → 6 → 9 → 12. Só a equipe que não detém a última aposta pode pedir o próximo degrau. Quem aceita passa a poder aumentar. Correr entrega a mão pelo valor já aceito.
- **Partida:** 12 pontos para vencer (`config.ts`).

## Pontos a validar antes de liberar

As regras acima seguem a versão mais comum do Truco Paulista. Variações regionais existem, principalmente na ordem entre manilhas, nos empates e na regra de quem começa após empate. Essas decisões ficam concentradas em `cards.ts` e `hand.ts` e devem ser confirmadas antes da etapa multiplayer.

## Fora do escopo deste repositório

- Dinheiro real, apostas e pagamentos: desabilitados até validação jurídica e contratação de provedor autorizado.
- Engenharia reversa de plataformas de terceiros: a identidade e o código são originais.
