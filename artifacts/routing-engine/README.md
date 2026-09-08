# Fretai Routing Engine

Serviço interno de otimização de rotas com OR-Tools e matriz viária do OSRM.

## Desenvolvimento local

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Configure a API principal:

```env
ROUTING_ENGINE_URL=http://localhost:8000
ROUTING_ENGINE_TOKEN=troque-por-um-segredo-longo
```

O mesmo valor de `ROUTING_ENGINE_TOKEN` deve existir nos dois serviços. Sem
`ROUTING_ENGINE_URL`, a geração automática de rotas fica indisponível e a API
retorna um erro de configuração.

## Produção

Crie um serviço Docker separado apontando a raiz para `artifacts/routing-engine`.
O endpoint público de demonstração do OSRM serve apenas para testes. Em produção,
configure `OSRM_URL` com uma instância dedicada.
