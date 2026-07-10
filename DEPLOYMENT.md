# EduM — Standard Server Deployment (no Docker)

Target stack: **Node.js 20+ · Next.js · PostgreSQL 16 · Redis 7 · PM2 · Nginx**
on a standard Linux server (Ubuntu/Debian shown; Windows notes at the end).

---

## 1. Prerequisites

```bash
# Node.js 20 LTS (via NodeSource or nvm)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PostgreSQL 16 + Redis + Nginx
sudo apt-get install -y postgresql-16 redis-server nginx

# PM2 (process manager)
sudo npm install -g pm2
```

Create the database and a dedicated user:

```bash
sudo -u postgres psql <<'SQL'
CREATE USER edum WITH PASSWORD 'CHANGE-ME-STRONG';
CREATE DATABASE edum OWNER edum;
SQL
```

## 2. Get the code & configure

```bash
sudo mkdir -p /opt/edum && sudo chown $USER /opt/edum
git clone <your-repo-url> /opt/edum && cd /opt/edum

npm install

# environment: one file for the API (dotenv), values documented in .env.example
cp .env.example apps/api/.env
nano apps/api/.env
```

Minimum values to change in `apps/api/.env` for production:

| Variable | Set to |
|---|---|
| `DATABASE_URL` | `postgresql://edum:CHANGE-ME-STRONG@localhost:5432/edum?schema=public` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | two long random strings (`openssl rand -hex 48`) |
| `REDIS_URL` | `redis://localhost:6379` |
| `S3_*` | your S3/MinIO credentials — **or leave unreachable** and the API stores uploads on local disk at `apps/api/uploads/` |

## 3. Build, migrate, seed

```bash
npm run build                 # builds apps/api (Nest) + apps/web (Next)
npm run migrate -w apps/api   # prisma migrate deploy
npm run seed                  # idempotent demo data (skip/remove for a blank school)
```

> For a production school without demo data, skip `npm run seed` and create
> your first super-admin directly:
> `npx ts-node --transpile-only prisma/seed.ts` seeds the demo; a blank-school
> bootstrap is: insert a `schools` row + one `users` row (role `super_admin`,
> bcrypt password hash) — see `prisma/seed.ts` for the exact fields.

## 4. Run with PM2

```bash
mkdir -p logs
pm2 start ecosystem.config.js     # edum-api (cluster ×2) + edum-web
pm2 save                          # persist process list
pm2 startup                       # generate boot service (follow printed command)
```

Useful operations:

```bash
pm2 status                        # health of both processes
pm2 logs edum-api --lines 100
pm2 reload ecosystem.config.js    # zero-downtime deploy after a new build
pm2 monit
```

Verify locally before fronting with Nginx:

```bash
curl http://127.0.0.1:4000/api/health     # {"status":"ok","db":"up",...}
curl -I http://127.0.0.1:3000/auth/login  # HTTP 200
```

## 5. Nginx reverse proxy

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/edum
sudo nano /etc/nginx/sites-available/edum      # set server_name to your domain
sudo ln -s /etc/nginx/sites-available/edum /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

TLS (strongly recommended — the app sets auth headers that should never
travel over plain HTTP outside a trusted network):

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d school.example.com
```

## 6. Updating a running deployment

```bash
cd /opt/edum
git pull
npm install
npm run build
npm run migrate -w apps/api
pm2 reload ecosystem.config.js
```

## 7. Backups & housekeeping

```bash
# nightly database dump (add to crontab)
pg_dump -U edum -d edum -F c -f /var/backups/edum-$(date +%F).dump

# uploaded files (if using local-disk fallback)
tar czf /var/backups/edum-uploads-$(date +%F).tgz -C /opt/edum/apps/api uploads
```

- Logs: PM2 writes to `./logs/`; rotate with `pm2 install pm2-logrotate`.
- Sessions/audit: old rows in `sessions` (revoked/expired) and `login_events`
  can be pruned periodically with a simple SQL job.

## 8. Security checklist

- [x] API sets Helmet headers; web sets X-Frame-Options/nosniff/etc.
- [x] Rate limiting (300 req/min/IP) at the API; tighten in `app.module.ts` if needed
- [x] JWT secrets from env only; access tokens 15 min; refresh tokens hashed + rotated
- [x] `trust proxy` enabled so audit logs record real client IPs behind Nginx
- [ ] Change **both** JWT secrets and the database password (deployment step)
- [ ] Enable TLS via certbot (step 5)
- [ ] Restrict PostgreSQL/Redis to localhost (default on Ubuntu) or a private network
- [ ] Optional: firewall to 80/443 only (`ufw allow 'Nginx Full' && ufw enable`)

## 9. Windows Server notes

The stack runs unchanged on Windows (no Docker required):

1. Install Node 20 LTS, PostgreSQL 16 and Redis (Memurai or Redis-on-WSL)
   and, optionally, Nginx for Windows — or use IIS with ARR as the reverse
   proxy with the same two upstreams (`127.0.0.1:4000` for `/api`,
   `127.0.0.1:3000` for everything else).
2. Same steps: `npm install`, copy `.env.example` → `apps/api/.env`,
   `npm run build`, `npm run migrate -w apps/api`, `npm run seed`.
3. PM2 works on Windows: `npm i -g pm2`, `pm2 start ecosystem.config.js`.
   For boot persistence use `pm2-installer` or a Scheduled Task running
   `pm2 resurrect` (the Unix `pm2 startup` flow is Linux-only).

## Troubleshooting

| Symptom | Check |
|---|---|
| `502` from Nginx | `pm2 status` — is `edum-web`/`edum-api` online? `pm2 logs` |
| API starts, `db: down` on /api/health | `DATABASE_URL` in `apps/api/.env`; `systemctl status postgresql` |
| Login works, everything else 403 | permissions not seeded — run `npm run seed` (or reset the matrix in Admin → Access Control) |
| Uploads fail | S3 unreachable and `apps/api/uploads/` not writable by the PM2 user |
| Wrong client IPs in audit log | ensure Nginx sends `X-Forwarded-For` (provided config does) |
