# Fretai Mobile

Aplicativo único para Android e iOS, construído com Expo e React Native.

## Perfis

- Parceiro transportador: visão operacional, frota, motoristas e conta.
- Motorista: agenda, rota, preparação de GPS e conta.
- Colaborador: viagens, ponto de embarque, avisos e conta. No primeiro acesso, usuário e senha são o CPF; em seguida, a troca de senha é obrigatória.

## Ambiente local

1. Use Node.js 22.13 ou superior.
2. Crie `.env` a partir de `.env.example`.
3. Na raiz do monorepo, execute `pnpm install`.
4. Execute `pnpm --filter @fretai/mobile-app start`.

Para testar GPS em segundo plano e notificações push, use um development build. O Expo Go não cobre esses recursos nativos por completo.

## Builds

Os identificadores nativos são `br.com.fretai.app`. Depois de vincular o projeto ao EAS:

```bash
pnpm --dir artifacts/mobile-app dlx eas-cli build --platform all
```
