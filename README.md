# Fasah Proxy

NestJS + TypeScript proxy for FASAH / ZATCA APIs. Handles schedule management, JWT auth, booking limits, queue appointments, and an auto-booking appointment watcher.

## Requirements

- **Node.js** 20+ (LTS recommended)
- **MongoDB** 6+
- **PM2** (production process manager)

## Quick start (development)

```bash
git clone <repo-url> fasah-proxy
cd fasah-proxy
npm install
cp .env.example .env   # edit values
npm run build
npm run dev            # watch mode
```

Health check: `GET http://localhost:3001/health`

Local MongoDB (optional):

```bash
docker compose up -d
```

## Environment

Copy `.env.example` to `.env` and configure at minimum:

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGO_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes (prod) | Secret for signing JWT tokens |
| `PORT` | No | HTTP port (default `3001`) |
| `FASAH_USE_PROXY` | No | Enable platform proxy rotation (`true`/`false`) |
| `WATCHER_ENABLED` | No | Enable appointment auto-booking watcher |
| `WATCHER_SCHEDULE_QUERY_TYPE` | No | FASAH schedule type (`SPECIAL` recommended) |

See `.env.example` for all watcher, booking limit, and seed variables.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run production build (`node dist/main.js`) |
| `npm run dev` | Development with hot reload |
| `npm run seed:admin` | Create admin user (requires build first) |
| `npm run seed:package-examples` | Seed example subscription users |

## API endpoints

- `GET /health` — health check
- `/api/auth/*` — authentication
- `/api/fasah/*` — FASAH proxy
- `/api/zatca/*` — ZATCA compatibility routes
- `/api/zatca-tas/v1`, `/v2`, `/customs/*`
- `/api/zatca-fleet/v1`, `/v2/*`
- `/api/queue-appointments/*` — queue appointment CRUD
- `/login`, `/users` — admin UI (static)

Postman collection: `postman/Fasah-Proxy.postman_collection.json`

## Project layout

```
src/
  main.ts              # App bootstrap + MongoDB connect
  app.module.ts        # Nest config module
  common/middleware/   # Auth guards
  schemas/             # Mongoose models
  services/            # Business logic (FASAH client, watcher, queue)
  routes/              # Express API routers
dist/                  # Compiled output (deploy this)
public/                # Admin static pages
scripts/               # Seed & utility scripts
```

---

## Production deployment with PM2

The appointment watcher and daily booking cron must run in **exactly one process**. Use `instances: 1` and `exec_mode: fork` (already set in `ecosystem.config.cjs`).

### 1. Prepare the server

```bash
# Ubuntu/Debian example
sudo apt update
sudo apt install -y git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

### 2. Clone and build

```bash
cd /var/www   # or your deploy path
git clone <repo-url> fasah-proxy
cd fasah-proxy
npm ci
cp .env.example .env
nano .env     # set MONGO_URI, JWT_SECRET, PORT, WATCHER_*, etc.
npm run build
```

### 3. Create log directory

```bash
mkdir -p logs
```

### 4. Start with PM2

The repo includes `ecosystem.config.cjs`:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # follow the printed command to enable boot on system restart
```

### 5. Verify

```bash
pm2 status
pm2 logs fasah-proxy --lines 50
curl http://127.0.0.1:3001/health
```

Expected log lines:

```
MongoDB connected (...)
FASAH Proxy Server (NestJS) running on port 3001
[watcher] started — ...
```

### PM2 commands (daily use)

```bash
pm2 restart fasah-proxy    # restart after config change
pm2 stop fasah-proxy
pm2 delete fasah-proxy
pm2 logs fasah-proxy
pm2 monit
```

### Deploy updates

```bash
cd /var/www/fasah-proxy
git pull
npm ci
npm run build
pm2 restart fasah-proxy
```

### Reverse proxy (Nginx)

Example Nginx site block:

```nginx
server {
    listen 80;
    server_name api.example.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Adjust `PORT` in `.env` and `proxy_pass` if you use a different port.

### Seed admin (first deploy)

```bash
npm run build
SEED_ADMIN_EMAIL=admin@example.com \
SEED_ADMIN_PASSWORD='YourStrongPassword12!' \
npm run seed:admin
```

### Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| `buffering timed out` on MongoDB | Wrong `MONGO_URI`, firewall, or Mongo not reachable |
| Watcher not booking | `WATCHER_ENABLED=false`, outside time window, or no queue rows |
| `JWT` auth fails | `JWT_SECRET` changed after tokens were issued |
| Port in use | Change `PORT` in `.env` or stop conflicting process |

Check PM2 logs:

```bash
pm2 logs fasah-proxy --err
```

---

## License

ISC
