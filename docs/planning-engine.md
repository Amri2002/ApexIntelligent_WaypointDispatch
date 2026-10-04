# Planning engine

Code: `web/src/lib/engine/plan.ts` (pure TypeScript, no I/O). Tests: `web/src/lib/engine/plan.test.ts`.

## Inputs

For one depot and one delivery date, the engine takes:

* the confirmed orders;
* the depot's vehicles, with workshop status and the fuel already used this week;
* the outlets;
* district travel times and service allowances;
* the hourly traffic speed index;
* whether the day falls in the monsoon;
* any window extensions the dispatcher agreed with a store.

## Hard rules

Every trip the engine outputs satisfies every rule below. A manual move is checked against the same rules by `validate()`.

| # | Rule | Where it is enforced |
|---|---|---|
| 1 | One brand and one district per trip | Draft grouping |
| 2 | Chilled orders only on refrigerated vehicles | `staticViolation` → `TEMPERATURE` |
| 3 | `van_only` outlets only by vans | `staticViolation` → `VAN_ONLY` |
| 4 | Vehicle from the outlet's depot and not in the workshop | `staticViolation` → `DEPOT` / `UNAVAILABLE` |
| 5 | Orders are not split by the engine | An oversized order is deferred as `OVERSIZE`, and the dispatcher can split it |
| 6 | Load within weight **and** volume capacity | `layout` → `WEIGHT` / `VOLUME` |
| 7 | At most 2 trips per vehicle per day, within the time budgets. Trip minutes = outbound + inter-stop × (orders − 1) + Σ handling (the Task 2B formula). Fresh trips share 270 min from 03:30. Style/Tech trips share 480 min from 08:00. 15 min reload between trips. | `scheduleVehicle` → `BUDGET` / `TRIPS` |
| 8 | Each stop is reached before its window closes (an early arrival waits for opening) | `layout` → `WINDOW` |
| 9 | Fuel for the day fits in the rest of the weekly quota | `scheduleVehicle` → `FUEL` |

## Allocation

1. **Priority order.** Orders deferred yesterday come first. Next come the outlets that have gone longest without a delivery. Then the hardest orders to carry (van-only, then chilled), the earliest window closes, and finally the larger orders.
2. **Greedy insertion.** Each order goes where it adds the fewest minutes. That can mean joining an existing trip with the same brand and district, or opening a new trip on a vehicle that has one free. The cost function penalises using a reefer for ambient goods or a van for a street that does not need one, so the scarce vehicles stay free for the orders that need them.
3. **Repair pass.** A deferred chilled order can take the place of an ambient order on a reefer trip if that ambient order can move to an ambient vehicle.
4. **Deferral diagnosis.** Anything left over gets a reason code and plain text: `OVERSIZE`, `REEFER_CAPACITY`, `VAN_CAPACITY`, `FUEL`, `WINDOW` or `FLEET_CAPACITY`. Each one is ranked by the same priority rule.
5. **Recovery suggestions.** For each deferral, the engine reruns placement with the outlet's window extended by up to 30 minutes. If that would let an existing vehicle serve the order, the deferral screen offers **Ask store to accept until HH:MM** with the named vehicle, pre-selected.

## Predictions (advisory, never constraints)

* **Predicted arrival** applies the hourly speed index for the district (monsoon or dry) to the travel legs.
* **Late risk** = 1 / (1 + exp((slack − midpoint) / scale)), clamped to 1–99%, where slack = window close − planned ETA. The midpoint and scale are fitted on 91,894 historical arrivals (`data/late_risk_model.csv`): 34.7 and 24.1 min on dry days, 68.7 and 27.7 min in the monsoon. The history's planned arrivals use the same free-flow formula as the engine, so the model applies directly. On the demo day (a monsoon day) this flags 25 Peliyagoda stops over 30%. The plan shows stops above 30% in amber.
* **Expected arrival for the store** = planned ETA + how far real arrivals ran behind plan at that stop position and season (median, with a 20–80% range, from `data/arrival_delay_model.csv`). If the likely arrival is after the window closes, the store sees a warning.
* **Predicted service time** scales the allowance by order size. This is a placeholder for the Datathon service-time model.

We calibrated these against the 2025 history. Actual travel is about 1.3× free-flow in dry months and 1.5–1.8× in the monsoon. 19.6% of historical stops arrived after the window (27.4% in the monsoon). The hard rules use the official formula so that plans match the brief, and the predictions flag where reality is likely to differ.

## Results on the demo day (Fri 10 April 2026)

| Depot | Orders | Placed | Chilled placed | Notes |
|---|---|---|---|---|
| Peliyagoda (S1 scenario) | 85 | 70 | 77.6 / 181.6 m³ | 5 of 9 reefers are in the workshop. Chilled demand is 2.1× one reefer wave, so deferrals are unavoidable. All 10 orders deferred yesterday are placed. |
| Kandy | 51 | 51 | all | Nothing deferred. |

## Breakdowns after publishing

`Engine.reassign()` repairs a published plan when a vehicle drops out. The dispatcher presses **Report … broken down** on a trip, and `reportBreakdown()` in `planService.ts` then:

1. Marks the vehicle out of service and takes off its trips that have not left the depot (planned, loading or sealed).
2. Lets only vehicles that have not started loading take extra orders. Each keeps its existing stops, and a vehicle can still open a second trip.
3. Re-homes each displaced order in the usual priority order, to the cheapest spot that passes all nine rules. Anything that fits nowhere is deferred to the next run as `BREAKDOWN`, with the rule that blocked it.
4. Tells the dock, the dispatcher's Live run feed and every affected store. A moved order gets *"Your delivery now comes on VEH…"*; a deferred one gets the usual deferral notice.

Tests break down two different vehicles in the demo plan and run the independent rule checker over the repaired day.

## Tests

`npm test` runs vitest. An independent rule checker (written separately from the engine) re-verifies every trip of both depots against all nine rules, and a set of targeted cases covers each rule:

* every order deferred yesterday is placed;
* an oversized order is deferred with `OVERSIZE`;
* a chilled order moved to an ambient truck is rejected with `TEMPERATURE`;
* a trip over the Fresh budget is flagged.
