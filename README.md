# Waypoint Dispatch

**Team Apex Intelligent** · Rootcode Tech-Triathlon 2026 · Hackathon

Waypoint Dispatch plans next-day deliveries for both depots and runs the day through to proof of delivery. The planning engine respects capacity, temperature, access, delivery windows and fuel. On days when the fleet is short, it defers orders with a reason and a rank, so the dispatcher can confirm the decisions and every store hears about them before cutoff. Loaders and drivers keep working without signal, and their records sync once the phone reconnects.

One responsive web app serves all four roles:

| Role | Device | Screens |
|---|---|---|
| Dispatcher | Desktop | Order queue · Plan with constraint checks · Deferral decisions · Live run · Capacity forecast |
| Loader | Tablet / phone | Dock departures · Load checklist with flags · Seal and hand over |
| Driver | Phone | Today's run · Stop with proof of delivery · Sync report (offline-first) |
| Store manager | Phone | Delivery ETA · Receipt or issue report · Deferral notice · Place order |

**Live demo:** `<add the deployed URL here>` · **Video:** `<add the video link here>`

---

## 1. Run it

You only need Docker:

```bash
git clone <repo-url> ApexIntelligent_WaypointDispatch
cd ApexIntelligent_WaypointDispatch
docker compose up --build
```

Open **http://localhost:3000**. On first start the web container migrates the database, then loads the reference data and the demo day (Friday 10 April 2026) from `data/`. No other steps are needed.

* To start over: press **Reset demo day** in the dispatcher sidebar, or run `SEED_FORCE=1 docker compose up`.
* Settings: Docker needs no `.env`. The database URL is fixed to the bundled Postgres. To change the session secret, create a `.env` file in the repo root containing `AUTH_SECRET=<random string>`.

### Without Docker (for development)

Requires Node 22 and PostgreSQL 16.

```bash
cd web
cp ../.env.example .env.local      # point DATABASE_URL at your Postgres
npm install
npm run db:migrate                 # migrate + seed (npm run db:reset to wipe and re-seed)
npm run dev                        # http://localhost:3000
npm test                           # engine unit tests (vitest)
BASE_URL=http://localhost:3000 node e2e/walkthrough.mjs   # full 4-role walkthrough (Playwright)
```

### Deploy

`render.yaml` is a Render Blueprint for the web service; the database is a free [Neon](https://neon.tech) Postgres. To use it: create a Neon project, then on Render choose **New → Blueprint →** select this repository, and paste the Neon connection string when Render asks for `DATABASE_URL`. The app creates the tables and loads the demo data on first start. Any Docker host also works if it provides `DATABASE_URL` and `AUTH_SECRET`.

## 2. Seeded accounts

All accounts use the password **`Waypoint@2026`**. The login page also has one-click buttons for each role.

| Role | Email | Seeded scope |
|---|---|---|
| Dispatcher | `dispatcher@waypoint.lk` | Both depots (switch at the top right) |
| Loader | `loader@waypoint.lk` | Kandy dock |
| Driver | `driver@waypoint.lk` | VEH041, Kandy (a demo picker switches vehicle) |
| Store manager | `store@waypoint.lk` | OUT106, Waypoint Fresh, Nuwara Eliya (a demo picker switches outlet) |

## 3. Judge walkthrough (about 10 minutes)

The demo day is **Friday 10 April 2026**, three days before New Year. Peliyagoda has 5 of its 9 refrigerated vehicles in the workshop, and chilled demand is 2.1× what one wave of the remaining reefers can carry. Kandy has a normal day.

Use a desktop window for the dispatcher. For the other roles, use a phone or a narrow window (about 390 px), in a private window so each role keeps its own session.

**Dispatcher: plan a short day (Peliyagoda)**
1. Sign in as **Dispatcher**. The **Orders** queue shows 85 confirmed orders, 409.9 m³ in total, of which 181.6 m³ is chilled. The *Before you plan* panel warns that S1-078 is too large for any vehicle, that 10 orders were deferred yesterday, and that chilled demand is 2.1× reefer capacity.
2. Press **Build plan for Fri, 10 Apr**. The plan places 70 of 85 orders. Select any trip bar to see its **constraint checks**: refrigeration, weight and volume, van-only access, every ETA inside its window, the Fresh 270-minute budget, the weekly fuel quota, and trip 1 of 2. **Move…** on an order lists the vehicles it can legally go to. Moving a chilled order to an ambient truck is refused with the reason.
3. Press **Review and decide** on the red banner. Each deferral has a reason (no reefer room, window, oversize), a rank and the impact on the store. The fairness check shows that every order deferred yesterday is on today's plan.
4. Press **Split into two loads** on S1-078. The order becomes two loads and the plan reruns. Where a later window would let a vehicle serve an order, the decision is pre-set to **Ask store to accept until HH:MM**. Fill the note on any outlet that is being skipped for a second day, then press **Confirm N deferrals**. Each store is notified straight away.
5. Back on **Plan**, press **Publish to docks and drivers**.

**Dispatcher: Kandy**
6. Switch the depot to **Kandy**, run the planner (all 51 orders are placed) and **Publish**.

**Loader (phone)**
7. Sign in as **Loader**. Open the **Nuwara Eliya** trip. At OUT106 press **Flag a problem → Damaged → +** and send. Tick the remaining stops, then press **Seal and hand over to the driver**. The store and the dispatcher are notified, and the driver's count is corrected.

**Driver (phone): offline mode**
8. Sign in as **Driver** (VEH041). Press **Start trip** and complete the first stop: receiver name, signature, then **Complete stop**.
9. Open the account menu (top right) and switch on **Simulate no signal**. The app works exactly as it would with no coverage. You can also turn the phone's network off for real. Record the remaining stops: each is **Saved on phone**, and the header counts what is waiting.
10. In the dispatcher's **Live run**, VEH041 shows as *No signal* with its last record and the predicted next stop.

**Store manager (phone)**
11. Sign in as **Store manager** (OUT106). The page shows the ETA with a range. Press **The truck is here**, then **Report an issue → Damaged → + → Send report**.

**Recovery**
12. On the driver's phone, switch **Simulate no signal** off. Queued records replay in order and exactly once. The **sync report** lists what was sent and shows that the store's damage report was automatically matched to the loader's flag, so the driver has nothing to do.

**Deferral from the store's side, and the forecast**
13. In the store app, use the **Outlet (demo)** picker to choose an outlet deferred in step 4. It sees the notice with the reason and new date, and can reply (for example, **Chiller will be empty**). **Place order** shows the 16:00 cutoff countdown and returns a reference number at once.
14. Dispatcher **Forecast**: weekly chilled demand as a share of reefer capacity for the next 10 weeks, with festival weeks marked and a workshop-timing recommendation.

## 4. How it works

* [Architecture and offline design](docs/architecture.md), including the [diagram](docs/architecture.svg).
* [Data model](docs/data-model.md), including the [ER diagram](docs/data-model.svg).
* [Planning engine](docs/planning-engine.md): the nine hard rules, the allocation order, deferral diagnosis and the test strategy.
* [AI disclosure](docs/ai-disclosure.md).

Stack: Next.js 15 (App Router, React 19, TypeScript) · PostgreSQL 16 with Drizzle ORM · JWT sessions · service worker and IndexedDB outbox · vitest and Playwright · Docker Compose.

```
ApexIntelligent_WaypointDispatch/
├── docker-compose.yml   Dockerfile   render.yaml   .env.example
├── data/                shared datasets + demo-day files (seeded on first start)
├── docs/                architecture, data model, planning engine, AI disclosure
└── web/
    ├── drizzle/         SQL migrations
    ├── scripts/         migrate.mjs (migrate + seed)
    ├── e2e/             walkthrough.mjs (Playwright, all four roles)
    └── src/
        ├── app/         dispatcher/ loader/ driver/ store/ login/ api/
        ├── components/
        ├── db/          schema.ts
        └── lib/         engine/ planService.ts opsService.ts auth.ts client/ (outbox, cache)
```

## 5. Departures from the design

The Designathon prototype was our starting point. Here is where the build differs, and why:

| Design | Build | Why |
|---|---|---|
| Illustrative figures: 76 of 85 placed, 110.4 of 181.6 m³ chilled, 7 deferrals and 2 window requests | Real engine output: 70 of 85 placed, 77.6 of 181.6 m³ chilled, 15 deferrals at Peliyagoda | The engine runs on the real datasets under all nine hard rules. The mockup numbers were drawn before the engine existed. |
| Oversized orders not covered | Orders stay whole. An oversized order is deferred as `OVERSIZE` with a **Split into two loads** action | The allocation rules treat orders as whole units, so splitting is a decision the dispatcher makes and can see. |
| Drag a stop between trips on the plan | **Move…** on each order lists only the vehicles it can legally go to. Illegal moves are refused with the rule | Same checks, but works with touch and keyboard, and judges cannot drop an order somewhere it cannot go. |
| Forecast for the next 8 weeks | 10 weeks, from a seasonal × recent-trend weekly model | The Datathon model is due later and will replace it behind the same API. |
| Offline shown by losing coverage | Real offline **and** a **Simulate no signal** switch in the account menu | Judges can test recovery without touching device settings. Both paths use the same outbox. |
| **Escalate to ops manager** on the deferral screen | Not built | There is no ops-manager role in the brief's four roles. Every decision is still logged with who, when and why. |
| One driver and one store | **Vehicle (demo)** and **Outlet (demo)** pickers, plus **Reset demo day** | They let one set of seeded accounts show every case, including a deferred store. |

## 6. Data confidentiality

`data/` contains the competition datasets, which the organisers' rules forbid sharing publicly. **Keep this repository private** and grant access only to the organisers. The public deployment shows derived views to signed-in demo users only. It does not offer the raw files for download.
