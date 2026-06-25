# Fasah Proxy — NestJS + TypeScript

## Run (NestJS)

```bash
npm install
npm run build
npm run dev          # watch mode
# or
npm start            # production (dist/main.js)
```

## Project layout

```
src/
  main.ts                 # Nest bootstrap
  app.module.ts           # Config + MongoDB
  polyfill-web-crypto.ts
  common/middleware/      # JWT guards (auth, admin)
  schemas/                # Mongoose models
  services/               # Business logic
  routes/                 # Express routers (same paths/handlers, TS)
  data/                   # Sample payloads
dist/                     # Compiled output
```

## Environment

Same `.env` as before (`MONGO_URI`, `JWT_SECRET`, `WATCHER_*`, `FASAH_USE_PROXY`, …).

## API compatibility

All endpoints are unchanged:

- `GET /health`
- `/api/auth/*`
- `/api/fasah/*`
- `/api/zatca/*`
- `/api/zatca-tas/v1|v2|customs/*`
- `/api/zatca-fleet/v1|v2/*`
- `/api/queue-appointments/*`
- Admin static: `/login`, `/users`

## Next steps (optional)

- Replace `src/routes/*.ts` Express routers with `@Controller()` + DTOs (`class-validator`)
- Inject services via `@Injectable()` instead of direct imports
- Use `@nestjs/schedule` for watcher + daily reset crons
