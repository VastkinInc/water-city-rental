# Water City Rental — Backend API

Node.js + Express + MongoDB Atlas backend for the Water City Rental
boat marketplace.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in the values:

   ```bash
   cp .env.example .env
   ```

   Required:
   - `MONGO_URI` — MongoDB Atlas connection string
   - `JWT_SECRET` — random 64-char string
   - `JWT_REFRESH_SECRET` — different random 64-char string
   - `CORS_ORIGIN` — frontend origin (default `http://localhost:5173`)

   Optional (filled in later):
   - `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`

3. Generate JWT secrets:

   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

## Run

Development (auto-reload via nodemon):

```bash
npm run dev
```

Production:

```bash
npm start
```

Server runs on `http://localhost:5000`.

## Endpoints

- `GET /` — service info
- `GET /api/health` — health check (returns DB status, env, timestamp)

## Project Structure

```
backend/
├── src/
│   ├── config/         # DB connection, env config
│   ├── models/         # Mongoose schemas (Day 2+)
│   ├── routes/         # Express route definitions
│   ├── controllers/    # Route handler logic (Day 2+)
│   ├── middleware/     # Express middleware (errorHandler, notFound, auth)
│   └── server.js       # App entry point
├── .env                # Local secrets (never commit)
├── .env.example        # Template (safe to commit)
└── package.json
```

## Tech Stack

- Node.js 20+
- Express 4
- MongoDB Atlas + Mongoose 8
- JWT auth (access 15min + refresh 7d httpOnly cookie)
- Stripe Connect (added later)

## Roadmap

- **Day 1** ✅ Foundation: Express, Mongo connection, health check
- **Day 2** Models: User, Boat, Captain, Booking
- **Day 3** Auth: register, login, refresh, logout
- **Day 4** Boats + Captains routes
- **Day 5** Bookings + Stripe Connect
- **Day 6** Deploy to Render
