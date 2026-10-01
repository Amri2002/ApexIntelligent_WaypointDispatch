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

**Still to be done by the team before submission**
* Deploy to the public URL and confirm the seeded accounts work there.
* Record the 5–8 minute demo video, following the judge walkthrough in the README.
* Do a final review of the code and the README, and push to the private repository shared with the organisers.

## AI assistance

* Generated first drafts of the code to the team's specification: the Drizzle schema and seed loader, the planning engine, the API route handlers, the React screens, the offline outbox and service worker, the unit tests and the Playwright walkthrough.
* Suggested fixes during debugging (for example, replacing Prisma with Drizzle when the Prisma engine download was blocked).
* Drafted this documentation (architecture, data model, planning engine, README) for the team to edit.

## What we did not use AI for

* No AI-generated data: every number in the app comes from the competition datasets or is computed from them by code in this repository.
* No AI service runs inside the product. The planning engine is deterministic code with no model calls at runtime.
