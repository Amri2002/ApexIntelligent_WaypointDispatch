# Waypoint Dispatch

[![CI](https://github.com/Amri2002/ApexIntelligent_WaypointDispatch/actions/workflows/ci.yml/badge.svg)](https://github.com/Amri2002/ApexIntelligent_WaypointDispatch/actions/workflows/ci.yml)

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

* To start over: press **Reset demo day** in the dispatcher sidebar, or run `SEED_FORCE=1 docker compose up`. Reset also sets the demo clock back to Thu 9 Apr, 21:00 (see below), so press it just before a demo.
* If you ran an earlier version, run `docker compose down -v` once so the database picks up the new migrations.
* Settings: Docker needs no `.env`. The database URL is fixed to the bundled Postgres. To change the session secret, create a `.env` file in the repo root containing `AUTH_SECRET=<random string>`.

### Without Docker (for development)

Requires Node 22 and PostgreSQL 16.

```bash
cd web
cp ../.env.example .env.local      # point DATABASE_URL at your Postgres
npm install
npm run db:migrate                 # migrate + seed (npm run db:reset to wipe and re-seed)
npm run dev                        # http://localhost:3000
npm test                           # unit tests (vitest); GitHub Actions also runs them, the typecheck and the build on every push
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

**The demo clock.** The app does not use today's date. It runs on a shared *story time* that starts at **Thu 9 Apr 2026, 21:00** (the evening before the demo day) and moves forward at normal speed. Every timestamp, notice and countdown uses it, and phones show it in their top bar. The dispatcher sidebar shows it with **+15m**, **+1 h** and **Set…**. It never goes backwards.

Field actions move the clock to the moment they would really happen, taken from that truck's own plan:

| Action | Time recorded |
|---|---|
| Loader checks, flags or seals | 40 minutes before the trip's planned start |
| Driver presses **Start trip** | The trip's planned start |
| Driver presses **Arrived at …** | The stop's planned arrival, **or the current story time if that is later** |
| Driver completes the stop | Arrival + the predicted unloading time |

So, if you click through at a normal pace, every stop is recorded on time and stores see *on time*. A stop is late when the clock is already past its planned arrival, either because you pressed **+15m** / **+1 h** first or because real time passed between clicks. The delay then carries on to the stops after it, and the stores further down the route see their expected time move. A truck is never recorded as early. With `DEMO_MODE=false` all of this is off: every action is stamped with the real time on the phone, and the clock buttons disappear.

Use a desktop window for the dispatcher. For the other roles, use a phone or a narrow window (about 390 px), in a private window so each role keeps its own session.

**Dispatcher: plan a short day (Peliyagoda)**
1. Sign in as **Dispatcher**. The **Orders** queue shows 85 confirmed orders, 409.9 m³ in total, of which 181.6 m³ is chilled. The *Before you plan* panel warns that S1-078 is too large for any vehicle, that 10 orders were deferred yesterday, and that chilled demand is 2.1× reefer capacity.
2. Press **Build plan for Fri, 10 Apr**. The plan places 70 of 85 orders. Select any trip bar to see its **constraint checks**: refrigeration, weight and volume, van-only access, every ETA inside its window, the Fresh 270-minute budget, the weekly fuel quota, and trip 1 of 2. **Move…** on an order lists the vehicles it can legally go to. Moving a chilled order to an ambient truck is refused with the reason.
3. Press **Review and decide** on the red banner. Each deferral has a reason (no reefer room, window, oversize), a rank and the impact on the store. The fairness check shows that every order deferred yesterday is on today's plan.
   *Optional: swap one order for another.* Every unplaced order has **Place on a vehicle…**, which checks every vehicle against all nine rules and lists only the ones that pass. The others are listed with the rule that blocks them. On this day no vehicle can take **S1-016** at first. Back on **Plan**, select VEH003's Colombo trip and press **Defer** on **S1-009**. Return here: **S1-016** can now go on VEH003, and S1-009 shows **Undo: put back on a vehicle…** until you confirm. A confirmed deferral cannot be pulled back, because the store has been told and the order is already on the next run.
4. Press **Split into two loads** on S1-078. The order becomes two loads and the plan reruns. Where a later window would let a vehicle serve an order, the decision is pre-set to **Ask store to accept until HH:MM**. Fill the note on any outlet that is being skipped for a second day, then press **Confirm N deferrals**. Each store is notified straight away.
5. Back on **Plan**, press **Publish to docks and drivers**.

**Dispatcher: Kandy**
6. Switch the depot to **Kandy**, run the planner (all 51 orders are placed) and **Publish**.

**Loader (phone)**
7. Sign in as **Loader**. Open the **Nuwara Eliya** trip. At OUT106 press **Flag a problem → Damaged → +** and send. Tick the remaining stops, then press **Seal and hand over to the driver**. The store and the dispatcher are notified, and the driver's count is corrected.

**Driver (phone): offline mode**
8. Sign in as **Driver** (VEH041). Press **Start trip** and complete the first stop: receiver name, signature, then **Complete stop**.
9. Tap the **Online** chip in the top bar and switch on **Simulate no signal**. The app works exactly as it would with no coverage. You can also turn the phone's network off for real. Record the remaining stops: each is **Saved on phone**, and the header counts what is waiting.
10. In the dispatcher's **Live run**, VEH041 shows as *No signal* with its last record and the predicted next stop.

**Store manager (phone)**
11. Sign in as **Store manager** (OUT106). The page shows the ETA with a range. Before the truck records a stop, the range comes from how trucks have run on days like this. Once the driver records a stop, it says *Updated from the truck* and moves with the truck's real lateness. To see this, press **+1 h** in the dispatcher sidebar before the driver records the next stop: the stop is recorded late, and the store's estimate moves later with it. Press **The truck is here**, then **Report an issue → Damaged → + → Send report**.

**Recovery**
12. On the driver's phone, switch **Simulate no signal** off. Queued records replay in order and exactly once. The **sync report** lists what was sent and shows that the store's damage report was automatically matched to the loader's flag, so the driver has nothing to do.

**Deferral from the store's side, and the forecast**
13. In the store app, use the **Outlet (demo)** picker to choose an outlet deferred in step 4. It sees the notice with the reason and new date, and can reply (for example, **Chiller will be empty**). **Place order** shows the 16:00 cutoff countdown and returns a reference number at once. The cutoff is enforced with the demo clock: before 16:00 an order goes on the next operating day (Fresh and Tech) or the store's next weekly day (Style). After 16:00 the next run is already being planned, so it goes one operating day later. To see it, press **Set… 16:05** in the dispatcher sidebar: an OUT106 order then moves from Sat 11 April to Wed 15 April, because 12–14 April are not operating days. Do this after step 16, because the next-run step expects the order on Sat 11 April.
14. Dispatcher **Forecast**: weekly chilled demand as a share of reefer capacity for the next 10 weeks, with festival weeks marked and a workshop-timing recommendation.

**When something breaks: a truck breaks down after publishing**
15. As the dispatcher, open **Plan**, choose **Fri, 10 Apr** and **Peliyagoda**, click the **VEH007** trip bar, then press **Report VEH007 broken down**. The engine re-homes its orders onto vehicles that have not started loading, keeping their existing stops and all nine rules. It moves the two dry orders to ordinary trucks and defers the two chilled orders, because no reefer has room left. The dock, the **Live run** feed and every affected store are told at once. As the **Store manager**, pick **OUT068** in the outlet picker to see *"Your delivery now comes on VEH030"*.

**The next run: closing the loop**
16. As the dispatcher, switch the day at the top right from **Fri, 10 Apr** to **Sat, 11 Apr · next run**. The **Orders** queue now holds the orders deferred in step 4, which go first, plus the order the store placed in step 13. Press **Build plan for Sat, 11 Apr**. The same engine and rules apply, and the 5 reefers are still in the workshop, so the plan shows honestly which deferred orders still cannot fit. Deferring one of them a second time requires a written note. (Only the dispatcher screens switch days; the loader, driver and store apps stay on 10 April.)

## 4. How it works

* [Architecture and offline design](docs/architecture.md), including the [diagram](docs/architecture.svg).
* [Data model](docs/data-model.md), including the [ER diagram](docs/data-model.svg).
* [Planning engine](docs/planning-engine.md): the nine hard rules, the allocation order, deferral diagnosis and the test strategy.
* [AI disclosure](docs/ai-disclosure.md).

Stack: Next.js 15 (App Router, React 19, TypeScript) · PostgreSQL 16 with Drizzle ORM · JWT sessions · service worker and IndexedDB outbox · vitest and Playwright · Docker Compose.

```
ApexIntelligent_WaypointDispatch/
├── docker-compose.yml   Dockerfile   render.yaml   .env.example   .github/workflows/ci.yml
├── data/                shared datasets + files derived from them (seeded on first start)
├── scripts/             build_demo_data.py: rebuilds the derived files in data/ from the raw datasets
├── docs/                architecture, data model, planning engine, AI disclosure
└── web/
    ├── drizzle/         SQL migrations
    ├── scripts/         migrate.mjs (migrate + seed)
    ├── e2e/             walkthrough.mjs (Playwright, all four roles), breakdown.mjs
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
| Offline shown by losing coverage | Real offline **and** a **Simulate no signal** switch behind the **Online** chip | Judges can test recovery without touching device settings. Both paths use the same outbox. |
| **Escalate to ops manager** on the deferral screen | Not built | There is no ops-manager role in the brief's four roles. Every decision is still logged with who, when and why. |
| One driver and one store | **Vehicle (demo)** and **Outlet (demo)** pickers, plus **Reset demo day** | They let one set of seeded accounts show every case, including a deferred store. With `DEMO_MODE=false` the pickers disappear and the server holds every account to its own outlet, vehicle and depot. |
| A single delivery day | A **day switch** for the dispatcher: the demo day and the **next run** | Orders deferred today and new store orders land on the next run, which can be planned with the same engine. Fuel used by published plans earlier in the week counts against the weekly quota. |

## 6. Where the numbers come from

Everything the app shows is either one of the organisers' files, used unchanged, or computed from them by `scripts/build_demo_data.py`. Nothing is typed in by hand. Run it with `python scripts/build_demo_data.py <folder with the unzipped General, Test and Training Data>`; it needs pandas.

| File in `data/` | Source |
|---|---|
| `outlets`, `vehicles`, `calendar`, `district_travel`, `service_allowance`, `traffic_speed` | General Data, unchanged |
| `demo_day_orders.csv` | Peliyagoda: Task 2B scenario S1 as given. Kandy: the real orders of 11 Apr 2025 from `deliveries_train.csv` |
| `demo_fleet_status.csv` | Task 2B scenario S1 fleet status as given |
| `fuel_used_week.csv` | Fuel each vehicle had already used before Friday: km actually driven Mon–Thu of the same week a year earlier (`route_legs_train.csv`, plus the drive back to the depot) ÷ km per litre |
| `late_risk_model.csv` | Chance of arriving after the window closes, given the minutes to spare at the planned ETA. A logistic model fitted on 91,894 historical arrivals, separately for dry and monsoon days |
| `arrival_delay_model.csv` | How far real arrivals ran behind the planned ETA (20th, 50th and 80th percentile) by season and stop position. Used for the store's "likely between" time |
| `style_schedule.csv` | Each Style outlet's weekly delivery weekday. In the history, every Style outlet's deliveries run on one fixed weekday, matching the booklet's "Style orders weekly for a scheduled delivery day" |
| `forecast_weekly.csv` | The same week last year × the year-on-year trend of the last 8 weeks of order history |

**Still illustrative:** the four users, the product lists on the store's order screen (the datasets have order sizes, not products), and which orders are marked as phone orders. The product lists do follow each brand: groceries (chilled and dry) for Fresh, garments for Style, appliances for Tech. Their pack sizes are set so typical orders look like the history.

**Brand schedules (booklet p.3):** a new Fresh order goes on the next run, before stores open at 8 AM. A new Tech order goes on the next run, during trading hours. A new Style order goes on that outlet's weekly delivery day (for example OUT015 → Thursday). The store's order screen shows which applies.

**Known limitations:** the loader, driver and store apps run the demo day only; the dispatcher can also plan the next run. After publishing, the only change the dispatcher can make is to report a breakdown; other edits need the draft. Service time is the official allowance scaled by order size, not a trained model (that is the Datathon's Task 1). The forecast is a one-off batch run rather than a scheduled job.

## 7. Data confidentiality

`data/` contains the competition datasets, which the organisers' rules forbid sharing publicly. **Keep this repository private** and grant access only to the organisers. The public deployment shows derived views to signed-in demo users only. It does not offer the raw files for download.
