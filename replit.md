# Fretai - Painel de Administração

## Overview

Sistema de gestão para a plataforma Fretai. Inclui site institucional, painel de administração de empresas/filiais e API backend.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui + Wouter

## Artifacts

- **institutional-site** (`/`): Site institucional + painel de dashboard do cliente master
- **api-server** (`/api`): Backend Express com autenticação JWT, empresas, filiais, colaboradores
- **orcamentos** (`/orcamentos/`): App standalone de orçamentos de transporte corporativo (React + Vite + Wouter + Leaflet)

## Módulo Orçamentos (`artifacts/orcamentos`)

App independente para criação e processamento de orçamentos de transporte:

### Tabelas DB (prefixo `orc_` para não conflitar com o painel admin):
- `orc_budgets` — orçamentos com empresa, estratégia, raio max, tempo max de rota
- `orc_employees` — funcionários do orçamento com geocodificação (lat/lng)
- `orc_vehicles` — tipos de veículo (Van, Micro-ônibus, Ônibus, Mini-Van) com custos
- `orc_routes` — rotas geradas pelo engine com turnos, direção (ida/volta), blocos de veículo
- `orc_boarding_points` — pontos de embarque com coordenadas e ordem na rota

### API (sem prefixo `/admin`):
- `GET/POST /api/vehicles` — gerenciar frota
- `GET/POST /api/companies` — listar/criar empresas (reutiliza tabela existente)
- `GET/POST /api/budgets` — criar/listar orçamentos
- `POST /api/budgets/:id/employees` — importar funcionários (geocodificação automática)
- `POST /api/budgets/:id/process` — rodar o motor de roteirização
- `GET /api/budgets/:id/summary` — sumário operacional
- `GET /api/budgets/stats` — estatísticas globais

### Routing Engine (`artifacts/api-server/src/lib/routingEngine.ts`):
- Agrupamento por turno, clustering geográfico em pontos de embarque
- Roteamento em camadas (Ônibus→Micro→Van→Mini-Van) com ocupação mínima por tier
- Fusão de rotas pequenas, pós-preenchimento, redimensionamento de veículos
- Geração de rotas de volta (vuelta) e blocos de veículo reutilizáveis entre turnos
- Geocodificação simulada com padrões para região de Jundiaí/SP

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Authentication

- **Platform admin**: credenciais via env vars `ADMIN_USERNAME` / `ADMIN_PASSWORD`
- **Cliente master**: login via email/senha, JWT com `entityId` da empresa

## Funcionalidade de Troca de Empresa

O admin master pode trocar entre Matriz e Filiais no painel lateral. Ao trocar:
- O nome exibido abaixo do nome do usuário (ex: "Gustavo") muda para o nome da empresa/filial selecionada
- O painel inteiro muda, mostrando apenas os dados (colaboradores, etc.) da empresa selecionada
- `nomeEmpresaAtiva` no contexto retorna `filialAtiva?.nome ?? empresaAtiva.nome`
- `colaboradoresDaFilial` filtra colaboradores pelo `filialId` da filial ativa
- Cadastro de colaborador é exclusivamente via importação de planilha (XLSX/CSV) na página `/painel/colaboradores` — não existe formulário de novo colaborador
- Template tem 14 colunas: Nome, CPF, Telefone, Cidade, Estado, Endereço, Nº, Complemento, CEP, Bairro, Turno, Horário entrada, Horário saída, Início da operação
- CPF, Telefone e CEP são auto-formatados na importação e na edição; status é sempre "Ativo" na importação

## Movimentação em Bloco Agendada

A página `/painel/movimentacao` não aplica mudanças imediatamente. Em vez disso, cria agendamentos com janela início/fim:
- 4 modos de seleção de alvos: Tabela (busca), Planilha (XLSX/CSV), TXT (colar), CPFs (colar livre)
- CPFs não encontrados são exibidos em um painel separado e o agendamento prossegue com os encontrados
- Agendamento aparece em `/painel/status-agendados`
- Sweeper roda no mount + a cada 60s e:
  - aplica `pendente → ativo` quando hoje >= início
  - reverte `ativo → concluído` quando hoje > fim (overlap-safe: só reverte se o valor atual ainda for o aplicado por este agendamento)
  - se um pendente já passou de fim sem ter sido aplicado (app fechado durante toda a janela), vai direto para concluído sem aplicar nem reverter
- Cancelar pendente: deleta. Cancelar ativo: reverte (overlap-safe) e marca concluído.

## Compras (Purchase Orders)

A página `/painel/compras` gera e exibe o histórico de pedidos de vale-transporte. Os pedidos são persistidos no banco de dados:
- `GET /api/me/purchase-orders?companyId=X` — lista pedidos da filial ativa
- `POST /api/me/purchase-orders` — cria um lote de pedidos (campo `items[]`)
- Tabela `purchase_orders` no banco com: companyId, employeeId (sem FK, nullable), nome, turno, periodo, dataInicio, dataFim, dias, vales, valorUnit, total, status, proRata
- O frontend carrega os pedidos via `useEffect` quando `filialAtiva` está disponível
- Ao confirmar a prévia, os pedidos são enviados ao servidor antes de atualizar o estado local

## Módulo de Orçamentos (Admin)

- **Tabelas DB**: `budgets`, `budget_employees`, `budget_route_vehicles`, `vehicle_types`
- **Endpoints**:
  - `GET/POST /api/admin/budgets` — listar / criar orçamentos
  - `GET /api/admin/budgets/:id` — detalhe de um orçamento
  - `PUT/DELETE /api/admin/budgets/:id` — atualizar / excluir
  - `GET /api/admin/budgets/:id/employees` — listar funcionários
  - `POST /api/admin/budgets/:id/employees` — adicionar 1 funcionário
  - `POST /api/admin/budgets/:id/employees/import` — importar CSV (body: `{employees:[{name,address,shift}]}`)
  - `DELETE /api/admin/budgets/:id/employees/:empId` — remover funcionário
  - `DELETE /api/admin/budgets/:id/employees` — limpar todos
  - `POST /api/admin/budgets/:id/process` — processa rotas (cria `budget_route_vehicles`, muda status para "pronto")
  - `GET /api/admin/budgets/:id/route-vehicles` — listar veículos gerados
- **Frontend** (`BudgetsSection.tsx`): 3 views (list / new / detail). Detail tem 4 abas:
  - **Visão Geral**: 4 KPI cards + Parâmetros + Frota Utilizada + Roteiro Diário por Veículo (após processamento)
  - **Funcionários**: upload CSV, adição manual, listagem com delete por linha ou limpeza total
  - **Rotas**: tabela de veículos com ocupação e "Reprocessar"
  - **Mapa Visual**: placeholder

## Key Files

- `artifacts/institutional-site/src/pages/dashboard/context.tsx` — contexto global do dashboard (empresas, filiais, colaboradores)
- `artifacts/institutional-site/src/pages/dashboard/layout.tsx` — layout do painel com menu lateral e troca de empresa
- `artifacts/institutional-site/src/pages/dashboard/compras.tsx` — página de compras de vale-transporte com persistência no banco
- `artifacts/api-server/src/routes/companies.ts` — rotas de empresas, filiais e funcionários
- `artifacts/api-server/src/routes/purchase-orders.ts` — rotas de pedidos de compra (GET/POST)
- `artifacts/api-server/src/routes/auth.ts` — autenticação (admin e usuários)
- `artifacts/api-server/src/middlewares/auth.ts` — middleware JWT
- `lib/db/src/schema/` — schema do banco de dados (Drizzle ORM)
- `lib/db/src/schema/purchase_orders.ts` — tabela de pedidos de compra

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
