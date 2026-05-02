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

## Módulo de Orçamentos (Admin) — Implementação Completa

### Tabelas DB novas (migradas)
- `budgets` — orçamento com campos: name, algorithm(strategy), companyId, status, destinationAddress, maxWalkingRadiusKm, maxTravelTimeMin
- `budget_workers` — funcionários por orçamento: name, address, shift ("HH:MM/HH:MM"), lat, lng, geocoded, boardingPointId
- `budget_routes` — rotas geradas: shiftTime, vehicleBlockId, totalPassengers, totalDistanceKm, estimatedMinutes, occupancyPct, totalCost, vehicleAssignments (JSONB)
- `budget_boarding_points` — pontos de embarque: routeId, name, lat, lng, passengerCount, sequenceOrder

### Endpoints API (`/api/admin/budgets`)
- `GET /api/admin/budgets` — lista com employeeCount e routeCount dos workers/routes
- `POST /api/admin/budgets` — cria com {name, companyId, companyAddress, maxRadiusKm, maxRouteMinutes, strategy}
- `GET /api/admin/budgets/:id` — detalhe: {budget, employees (budget_workers), routes (com boardingPoints)}
- `PATCH /api/admin/budgets/:id` — atualiza campos
- `DELETE /api/admin/budgets/:id` — exclui em cascata (bps → routes → workers → budget)
- `GET /api/admin/budgets/:id/summary` — {totalCost, totalEmployees}
- `POST /api/admin/budgets/:id/employees` — importa [{name, address, shift}], faz fake-geocode e salva em budget_workers
- `DELETE /api/admin/budgets/:id/employees` — limpa todos os workers
- `DELETE /api/admin/budgets/:id/employees/:wid` — remove 1 worker
- `POST /api/admin/budgets/:id/process` — algoritmo de bin-packing por strategy (min_cost/min_vehicles/max_occupancy), cria routes + boarding_points, atualiza boardingPointId nos workers

### Algoritmo de Processamento
- Agrupa workers por turno (parse "06:00/14:20" → start "06:00")
- Bin-packing usando vehicle_types ordenados por strategy
- vehicleBlockId reusado entre turnos compatíveis (turno B começa quando A termina ±30min)
- Geocodificação determinística por hash do endereço (scatter ao redor do endereço da empresa)
- 1 boarding_point por grupo de endereço similar dentro de cada rota

### Frontend (`BudgetsSection.tsx`) — 3 views, 4 abas
- **List view**: tabela com status badge, employeeCount, routeCount, botão criar/ver/deletar
- **New view**: form com nome, empresa, endereço destino, raio máximo, tempo máximo, estratégia
- **Detail view** (4 abas):
  - **Visão Geral**: 4 KPI cards (Custo, Passageiros por turno, Rotas/Turnos, Veículos Físicos) + Parâmetros + Frota Utilizada + Roteiro Diário por Veículo (tabela veículo × horário com entrada→/saída←, timeline do primeiro veículo)
  - **Funcionários**: upload planilha (xlsx/xls/csv/ods) com normalização de colunas, tabela com delete, botão limpar tudo
  - **Rotas**: PassengerListCard com busca, filtro de turno, lista por rota → boarding point → funcionários (accordion)
  - **Mapa Visual**: RouteMap Leaflet com filtros de turno/veículo, rotas via OSRM, pontos de embarque, funcionários geocodificados, raio configurável

### Componentes
- `artifacts/institutional-site/src/components/RouteMap.tsx` — Leaflet map com react-leaflet, OSRM road routing, panel de filtros, circle radius overlay

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
