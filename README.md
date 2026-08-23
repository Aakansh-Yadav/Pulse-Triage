# Pulse Triage

AI-driven smart triage and automated medical appointments. Doctor slots are **first-come, first-served**. High-risk patients who wait get hospital staff assistance until their turn so they do not deteriorate. Ava manages low-risk cases while doctors are paid for every plan they oversee.

## What you get

- **Patients** — mobile-first intake with Ava, FCFS doctor booking, staff cover while waiting if high risk
- **Doctors** — dense live board in registration order, WebSocket schedule stream, AI oversight inbox, split-payout ledger
- **Staff** — bridge care for high-risk patients whose registered slot is later
- **Scheduler** — first registration among **in-person (high-risk)** visits gets the earliest slot; Ava’s online cases never occupy the clinic queue
- **Payments** — Stripe Connect-style destination charges or Razorpay Route transfers; demo ledger if no keys

## Tech stack

| Layer | Choice |
| --- | --- |
| Web | Next.js App Router, TypeScript, Tailwind CSS |
| API | Node.js + Express, WebSockets (`ws`) |
| Data | PostgreSQL (or embedded PGlite if Docker/Postgres is not running) |
| Live queue | Redis sorted sets (or in-memory replica) |
| AI | OpenAI (`gpt-4o-mini`) with a clinical rules fallback |
| Billing | Stripe and/or Razorpay, auto-mock otherwise |

Python is not required. Express is used because this machine does not have Python; the product surface matches the spec.

## Run locally

```bash
cd pulse-triage
copy .env.example .env
npm install
npm run install:all
npm run dev
```

- App: [http://localhost:3000](http://localhost:3000)
- API: [http://localhost:4000/health](http://localhost:4000/health)

### Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Patient | `patient@demo.com` | `demo1234` |
| Patient 2 | `patient2@demo.com` | `demo1234` |
| Doctor | `doctor@demo.com` | `demo1234` |
| Doctor 2 | `doctor2@demo.com` | `demo1234` |

Try a low-risk line such as “mild sore throat for two days”, then a high-risk line such as “crushing chest pain radiating to my left arm”. Watch the doctor board reorder.

### PostgreSQL + Redis (recommended in production)

```bash
docker compose up -d
```

Set in `.env`:

```
DATABASE_URL=postgres://pulsetriage:pulsetriage@localhost:5432/pulsetriage
REDIS_URL=redis://localhost:6379
```

If those services are down, the API still boots: **PGlite** (embedded Postgres) + an in-memory live queue. Same schema, same priority math.

### OpenAI & payments

- `OPENAI_API_KEY` — Ava uses GPT; without it, a red-flag rules engine still classifies high vs low
- `STRIPE_SECRET_KEY` — PaymentIntents with `transfer_data.destination` + `application_fee_amount`
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` — orders with Route `transfers`
- `PAYMENT_PROVIDER=auto|stripe|razorpay|mock`

This is a demo. Do not put real patient data in it.
