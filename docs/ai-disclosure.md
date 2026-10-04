# AI disclosure: Hackathon

**Team:** Apex Intelligent · **Solution:** Waypoint Dispatch · **Competition:** Rootcode Tech-Triathlon 2026, Hackathon

We used an AI assistant (Claude, by Anthropic) as a coding assistant during this build. This page sets out what the team did and what the assistant did. The team reviewed, ran and is accountable for all submitted code.

## Team contribution

**Problem framing and design**
* Read the Hackathon brief and mapped each requirement to a screen and an API: the four roles, the planning engine, deferral on over-capacity days, and offline mode with recovery.
* Carried the Designathon work into the build: the personas, the 15 screens (D1–D4, L1–L3, V1–V2, M1–M3, G1–G4) and the judge storyline. The README records every departure from that design.
* Chose the stack (Next.js, PostgreSQL, Docker Compose) and the repository layout the brief asks for.

**Data analysis that shaped the engine**
* Explored the shared datasets: outlets, vehicles, district travel, service allowances, traffic speed, calendar and the 2025 order and trip history.
* Measured how far real travel strays from free-flow time (about 1.3× in dry months, 1.5–1.8× in the monsoon) and how often stops ran late (19.6% overall, 27.4% in the monsoon). These figures are why ETAs carry a late-risk estimate.
* Built the demo day from the S1 scenario (Peliyagoda) and the 11 April 2025 history (Kandy), and checked that it reproduces the reefer shortage the brief describes.

**Engine rules and verification**
* Specified the nine hard rules, the Task 2B trip-time formula and budgets, and the priority order (deferred-yesterday first, then longest unserved, then hardest to carry).
* Defined what a good deferral looks like: a reason the dispatcher can explain to a store, a rank, and a recovery option where one exists.
* Reviewed the engine output trip by trip against the rules and the independent checker.

**Building, testing and QA**
* Ran the app locally and walked through every role on desktop and phone sizes. Tested offline mode with real network loss and with the simulate switch. Fixed the issues found: table clipping, trip-bar labels, an over-confident late-risk curve, a forecast loading race, an outbox bug that stopped offline records sending after reconnect, and duplicate stop records after sync.
* Ran the unit tests and the end-to-end walkthrough, and checked the screenshots.

**Making it behave like a real system**
* Reviewed the first build for anything hard-coded for the demo, and asked for the parts that matter in a real depot to be made real: re-planning after a vehicle breakdown, planning the next run, each brand's delivery schedule (Fresh daily before 08:00, Style on the store's weekly day, Tech as needed), and the 16:00 order cutoff.
* Asked for a shared demo clock, so every timestamp follows the story of the demo day, and for the store's expected arrival to update from the truck's real progress.
* Asked for the dispatcher to be able to swap orders: place an order the engine left out, and undo a manual deferral before confirming it.
* Validated the engine's peak-day plan with the organisers' Task 2B checker (`check_allocation.py`): passed, with 70 orders served and 15 deferred.

**Testing that found real defects**
* Walked through every role after each change, on desktop and phone sizes, and reported what looked wrong. Each report traced back to a real defect that was then fixed:
  * every stop after the first recorded the same arrival time;
  * a store that receives two deliveries (chilled on a reefer, dry on a truck) saw only one of them;
  * the driver's top-bar time and the recorded arrival time disagreed;
  * a completed stop reopened as a blank form;
  * sign-out was hidden behind the connection status;
  * a moved order always joined a vehicle's first trip, so some legal moves were refused.

## AI assistance

* Generated first drafts of the code to the team's specification: the Drizzle schema and seed loader, the planning engine, the API route handlers, the React screens, the offline outbox and service worker, the unit tests and the Playwright walkthrough.
* Suggested fixes during debugging (for example, replacing Prisma with Drizzle when the Prisma engine download was blocked).
* In the later rounds, drafted the code for the features above to the team's specification: breakdown re-planning, next-run planning, brand delivery schedules, the order cutoff, the demo clock, live arrival estimates, the vehicle-options dry run behind **Move…** and **Place…**, and the CI workflow. It also wrote the end-to-end tests that check each feature.
* Drafted this documentation (architecture, data model, planning engine, README) for the team to edit.

## What we did not use AI for

* No AI-generated data: every number in the app comes from the competition datasets or is computed from them by code in this repository.
* No AI service runs inside the product. The planning engine is deterministic code with no model calls at runtime.
