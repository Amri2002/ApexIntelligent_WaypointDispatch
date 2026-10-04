"""Rebuild the derived demo files in data/ from the organisers' raw datasets.

Usage:
    python scripts/build_demo_data.py <folder with the unzipped "General Data", "Test Data", "Training Data">

Writes:
    data/demo_day_orders.csv   Peliyagoda = Task 2B scenario S1 (as given); Kandy = real orders of 11 Apr 2025
    data/demo_fleet_status.csv Task 2B scenario S1 fleet status (as given)
    data/forecast_weekly.csv   weekly volume forecast for ISO weeks 14-23 of 2026, per depot
    data/fuel_used_week.csv    fuel each vehicle had already used before the demo day (Mon-Thu), from the
                               km actually driven Mon-Thu of the same ISO week last year (route_legs_train)
    data/late_risk_model.csv   logistic model of P(arrive after the window closes | planned slack, monsoon),
                               fitted on every historical arrival (route_legs_train + deliveries_train)
    data/arrival_delay_model.csv  how far actual arrivals ran behind the planned ETA (20th/50th/80th
                               percentile, minutes) by season and stop position on the route

The six reference files (outlets, vehicles, calendar, district_travel, service_allowance,
traffic_speed) are copied unchanged from "General Data". Needs pandas.
"""
import shutil
import sys
from pathlib import Path

import numpy as np
import pandas as pd

RAW = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
OUT = Path(__file__).resolve().parent.parent / "data"
KANDY_DAY = pd.Timestamp("2025-04-11")   # same week last year as the demo day (Fri 10 Apr 2026)
FORECAST_WEEKS = range(14, 24)           # the 10 weeks shown on the Forecast screen
TREND_WEEKS = 8                          # recent weeks used for the year-on-year trend


def iso_key(ts):
    c = ts.isocalendar()
    return (c.year, c.week)


def main():
    for f in ["outlets", "vehicles", "calendar", "district_travel", "service_allowance", "traffic_speed"]:
        shutil.copyfile(RAW / "General Data" / f"{f}.csv", OUT / f"{f}.csv")

    # ---- Demo day orders -------------------------------------------------------------
    s1 = pd.read_csv(RAW / "Test Data" / "task2b_peak_day_scenarios.csv")
    s1 = s1[s1.scenario == "S1"]
    cols = ["order_ref", "outlet_id", "temp_requirement", "order_units", "order_weight_kg",
            "order_volume_m3", "deferred_yesterday", "days_since_last_served", "depot"]
    pel = s1[cols]

    hist = pd.read_csv(RAW / "Training Data" / "deliveries_train.csv", parse_dates=["order_date", "dispatch_date"])
    day = hist[(hist.order_date == KANDY_DAY) & (hist.depot == "Kandy")].sort_values("delivery_id").copy()
    before = hist[(hist.dispatch_date < KANDY_DAY) & (hist.dispatch_status == "attempted")]
    last_served = before.groupby("outlet_id").dispatch_date.max()
    # In the history a deferred order keeps its order_date and gets a later dispatch_date, so
    # "deferred yesterday" = the outlet ordered the day before and that order was pushed back.
    prev_day = hist[hist.order_date == KANDY_DAY - pd.Timedelta(days=1)]
    deferred_prev = set(prev_day[prev_day.dispatch_status == "deferred"].outlet_id)
    day["order_ref"] = [f"K1-{i:03d}" for i in range(len(day))]
    day["deferred_yesterday"] = day.outlet_id.isin(deferred_prev).astype(int)
    day["days_since_last_served"] = [
        max(1, (KANDY_DAY - last_served[o]).days) if o in last_served else 1 for o in day.outlet_id]
    kan = day[cols]
    pd.concat([pel, kan]).to_csv(OUT / "demo_day_orders.csv", index=False)

    fleet = pd.read_csv(RAW / "Test Data" / "task2b_peak_day_fleet.csv")
    fleet[fleet.scenario == "S1"][["vehicle_id", "status"]].to_csv(OUT / "demo_fleet_status.csv", index=False)

    # ---- Weekly forecast ---------------------------------------------------------------
    # forecast(week) = volume in the same ISO week of 2025
    #                  x (volume in the last 8 complete weeks / volume in the same 8 weeks a year earlier)
    # computed separately for total and chilled volume. All orders count (demand, not deliveries).
    hist["iso"] = hist.order_date.map(iso_key)
    hist["chilled_m3"] = hist.order_volume_m3.where(hist.temp_requirement == "chilled", 0.0)
    weekly = hist.groupby(["depot", "iso"]).agg(total=("order_volume_m3", "sum"), chilled=("chilled_m3", "sum"))

    last_day = hist.order_date.max()
    last_complete = last_day - pd.Timedelta(days=last_day.weekday() + 1) if last_day.weekday() < 5 else last_day
    recent = [iso_key(last_complete - pd.Timedelta(weeks=i)) for i in range(TREND_WEEKS)]
    year_before = [(y - 1, w) for y, w in recent]

    rows = []
    for depot in ["Peliyagoda", "Kandy"]:
        w = weekly.loc[depot]
        ratio = {c: w.loc[w.index.isin(recent), c].sum() / w.loc[w.index.isin(year_before), c].sum() for c in ["total", "chilled"]}
        for wk in FORECAST_WEEKS:
            base = w.loc[[(2025, wk)]].iloc[0]
            rows.append({"depot": depot, "iso_year": 2026, "iso_week": wk,
                         "forecast_total_m3": round(base.total * ratio["total"], 1),
                         "forecast_chilled_m3": round(base.chilled * ratio["chilled"], 1)})
        print(f"{depot}: trend weeks {recent[-1]}..{recent[0]}, total x{ratio['total']:.3f}, chilled x{ratio['chilled']:.3f}")
    pd.DataFrame(rows).to_csv(OUT / "forecast_weekly.csv", index=False)

    # ---- Fuel already used this week -------------------------------------------------------
    # The datasets give each vehicle's weekly quota but not its running total. We take the km each
    # vehicle actually drove Mon-Thu of the same ISO week a year earlier (7-10 Apr 2025), add the
    # return to the depot (route legs end at the last outlet), and divide by its km per litre.
    legs = pd.read_csv(RAW / "Training Data" / "route_legs_train.csv", parse_dates=["date"])
    week = legs[(legs.date >= "2025-04-07") & (legs.date <= "2025-04-10")]
    travel = pd.read_csv(RAW / "General Data" / "district_travel.csv").set_index("district")
    vehicles = pd.read_csv(RAW / "General Data" / "vehicles.csv").set_index("vehicle_id")
    routes = week.groupby(["vehicle_id", "route_id"]).agg(km=("distance_km", "sum"), district=("district", "first")).reset_index()
    routes["km"] += routes.district.map(travel.depot_to_district_km)
    km = routes.groupby("vehicle_id").km.sum().reindex(vehicles.index, fill_value=0.0)
    fuel = pd.DataFrame({"vehicle_id": vehicles.index, "km_mon_thu": km.round(1).values,
                         "fuel_used_l": (km / vehicles.km_per_l).round(1).values})
    fuel.to_csv(OUT / "fuel_used_week.csv", index=False)
    # ---- Late-risk model ------------------------------------------------------------------
    # The history's planned arrival times use the same free-flow formula as the planning engine,
    # so we can learn how often a stop planned with S minutes to spare actually arrived after the
    # window closed. Fit p = 1 / (1 + exp((S - midpoint) / scale)) separately for dry and monsoon days.
    deliv = hist[["dispatch_date", "outlet_id", "window_close_time"]].copy()
    deliv["dispatch_date"] = deliv.dispatch_date.dt.strftime("%Y-%m-%d")
    deliv = deliv.drop_duplicates(["dispatch_date", "outlet_id"])
    arr = legs.dropna(subset=["arrival_time", "planned_arrival_time"]).copy()
    arr["date"] = arr.date.dt.strftime("%Y-%m-%d")
    arr = arr.merge(deliv, left_on=["date", "to_outlet"], right_on=["dispatch_date", "outlet_id"])
    mins = lambda t: t.str.slice(0, 2).astype(int) * 60 + t.str.slice(3, 5).astype(int)
    slack = (mins(arr.window_close_time) - mins(arr.planned_arrival_time)).astype(float).values
    late = (mins(arr.arrival_time) > mins(arr.window_close_time)).astype(float).values
    model = []
    for monsoon in (0, 1):
        sel = arr.monsoon.values == monsoon
        X = np.c_[np.ones(sel.sum()), slack[sel]]
        y = late[sel]
        w = np.zeros(2)
        for _ in range(50):  # Newton-Raphson for logistic regression
            p = 1 / (1 + np.exp(-X @ w))
            w += np.linalg.solve(X.T @ (X * (p * (1 - p))[:, None]) + 1e-9 * np.eye(2), X.T @ (y - p))
        model.append({"monsoon": monsoon, "midpoint_min": round(-w[0] / w[1], 1), "scale_min": round(-1 / w[1], 1),
                      "arrivals": int(sel.sum()), "late_rate": round(y.mean(), 3)})
    pd.DataFrame(model).to_csv(OUT / "late_risk_model.csv", index=False)
    print("late-risk model:", model)

    # ---- Arrival delay vs the planned ETA ---------------------------------------------------
    hist_arr = legs.dropna(subset=["arrival_time", "planned_arrival_time"]).copy()
    hist_arr["delay"] = mins(hist_arr.arrival_time) - mins(hist_arr.planned_arrival_time)
    hist_arr["stop"] = hist_arr.seq.clip(upper=6) + 1  # stop 1..7, where 7 means "7th or later"
    q = hist_arr.groupby(["monsoon", "stop"]).delay.quantile([0.2, 0.5, 0.8]).unstack().round().astype(int)
    q.columns = ["p20_min", "p50_min", "p80_min"]
    q.reset_index().to_csv(OUT / "arrival_delay_model.csv", index=False)

    # ---- Style weekly schedule -----------------------------------------------------------
    # The booklet: "Style orders weekly for a scheduled delivery day". In the history every Style
    # outlet's deliveries run on one weekday; record it so the store app can show it.
    style = hist[(hist.brand == "Style") & (hist.dispatch_status == "attempted")]
    sched = style.groupby("outlet_id").dispatch_date.agg(lambda d: d.dt.day_name().mode().iloc[0])
    sched.rename("delivery_weekday").reset_index().to_csv(OUT / "style_schedule.csv", index=False)

    print("fuel used: median", round((fuel.fuel_used_l / vehicles.weekly_fuel_quota_l.values).median() * 100), "% of quota")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
