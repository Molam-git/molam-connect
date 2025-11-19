# Tests d'intégration — SIRA Float Optimizer (Sous-Brique)

## Pré-requis

1. **PostgreSQL** ≥ 13
2. Créer une base dédiée (ex. `createdb molam_test`)
3. Exporter `DATABASE_URL` vers cette base

```bash
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/molam_test
```

## Installation

```bash
cd brique-138/ai-float-optimizer
npm install
```

## Migrations & seeds

```bash
npm run migrate
npm run seed:banks   # optionnel : profils bancaires réalistes
```

## Lancer les tests

```bash
npm test
```

Les tests exécutent le worker en mode `simulate:true` et vérifient :

- création d'une `float_recommendation`
- présence du backtest (`reason.backtest`)
- absence d'`float_actions_log` en mode simulate

## Notes

- Les fichiers `src/events/publisher.ts`, `src/ledger/index.ts` et `src/treasury/routing.ts` sont des stubs prêts à être branchés sur les services Molam existants.
- `jest.config.cjs` est pré-configuré avec `ts-jest`.
- Adapter `DATABASE_URL` dans CI/CD selon l'environnement.

