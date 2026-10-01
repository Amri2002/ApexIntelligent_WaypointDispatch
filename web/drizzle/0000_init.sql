CREATE TABLE "calendar_days" (
	"date" text PRIMARY KEY NOT NULL,
	"dow_name" text NOT NULL,
	"is_operating" boolean NOT NULL,
	"is_holiday" boolean NOT NULL,
	"is_payday" boolean NOT NULL,
	"festival" text,
	"festival_ramp" double precision NOT NULL,
	"monsoon" boolean NOT NULL,
	"iso_year" integer NOT NULL,
	"iso_week" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deferrals" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"from_date" text NOT NULL,
	"to_date" text NOT NULL,
	"reason_code" text NOT NULL,
	"reason_text" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'proposed' NOT NULL,
	"rank" integer DEFAULT 0 NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"store_impact" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "district_travel" (
	"district" text PRIMARY KEY NOT NULL,
	"depot" text NOT NULL,
	"road_class" text NOT NULL,
	"free_flow_kmh" double precision NOT NULL,
	"depot_to_district_km" double precision NOT NULL,
	"depot_to_district_min" double precision NOT NULL,
	"inter_stop_km" double precision NOT NULL,
	"inter_stop_min" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forecast_weeks" (
	"depot" text NOT NULL,
	"iso_year" integer NOT NULL,
	"iso_week" integer NOT NULL,
	"total_m3" double precision NOT NULL,
	"chilled_m3" double precision NOT NULL,
	CONSTRAINT "forecast_weeks_depot_iso_year_iso_week_pk" PRIMARY KEY("depot","iso_year","iso_week")
);
--> statement-breakpoint
CREATE TABLE "load_flags" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"stop_id" text,
	"item" text NOT NULL,
	"issue_type" text NOT NULL,
	"qty" integer NOT NULL,
	"note" text,
	"photo" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"audience" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"ref_id" text,
	"response" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"outlet_id" text NOT NULL,
	"depot" text NOT NULL,
	"brand" text NOT NULL,
	"temp" text NOT NULL,
	"units" integer NOT NULL,
	"weight_kg" double precision NOT NULL,
	"volume_m3" double precision NOT NULL,
	"delivery_date" text NOT NULL,
	"source" text DEFAULT 'app' NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"deferred_yesterday" boolean DEFAULT false NOT NULL,
	"days_since_last_served" integer DEFAULT 1 NOT NULL,
	"lines" jsonb,
	"parent_ref" text,
	"stop_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE "outlets" (
	"id" text PRIMARY KEY NOT NULL,
	"brand" text NOT NULL,
	"district" text NOT NULL,
	"depot" text NOT NULL,
	"dock_type" text NOT NULL,
	"parking_constraint" text NOT NULL,
	"mall_window" text,
	"window_open" text NOT NULL,
	"window_close" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"depot" text NOT NULL,
	"date" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" text,
	"summary" jsonb
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"stop_id" text NOT NULL,
	"status" text NOT NULL,
	"issue_type" text,
	"qty" integer,
	"note" text,
	"photo" text,
	"matched_flag_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipts_stop_id_unique" UNIQUE("stop_id")
);
--> statement-breakpoint
CREATE TABLE "service_allowance" (
	"brand" text NOT NULL,
	"dock_type" text NOT NULL,
	"minutes" double precision NOT NULL,
	CONSTRAINT "service_allowance_brand_dock_type_pk" PRIMARY KEY("brand","dock_type")
);
--> statement-breakpoint
CREATE TABLE "stops" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"seq" integer NOT NULL,
	"outlet_id" text NOT NULL,
	"eta_min" integer NOT NULL,
	"pred_service_min" double precision NOT NULL,
	"late_risk" double precision NOT NULL,
	"loaded" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"arrived_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"receiver_name" text,
	"signature" text,
	"photo" text,
	"delivered_units" integer,
	"note" text,
	"gps" text,
	"recorded_offline" boolean DEFAULT false NOT NULL,
	"synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sync_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"client_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"result" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traffic_speed" (
	"district" text NOT NULL,
	"hour" integer NOT NULL,
	"monsoon" integer NOT NULL,
	"speed_index" double precision NOT NULL,
	CONSTRAINT "traffic_speed_district_hour_monsoon_pk" PRIMARY KEY("district","hour","monsoon")
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"vehicle_id" text NOT NULL,
	"trip_no" integer NOT NULL,
	"brand" text NOT NULL,
	"district" text NOT NULL,
	"carries_chilled" boolean DEFAULT false NOT NULL,
	"start_min" integer NOT NULL,
	"trip_minutes" integer NOT NULL,
	"km" double precision NOT NULL,
	"fuel_l" double precision NOT NULL,
	"load_kg" double precision NOT NULL,
	"load_m3" double precision NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"sealed_at" timestamp with time zone,
	"departed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"offline_since" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"password_hash" text NOT NULL,
	"depot" text,
	"vehicle_id" text,
	"outlet_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"temp" text NOT NULL,
	"weight_cap_kg" double precision NOT NULL,
	"volume_cap_m3" double precision NOT NULL,
	"fuel_type" text NOT NULL,
	"km_per_l" double precision NOT NULL,
	"weekly_fuel_quota_l" double precision NOT NULL,
	"fuel_used_week_l" double precision DEFAULT 0 NOT NULL,
	"depot" text NOT NULL,
	"status" text DEFAULT 'available' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deferrals" ADD CONSTRAINT "deferrals_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_flags" ADD CONSTRAINT "load_flags_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_flags" ADD CONSTRAINT "load_flags_stop_id_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."stops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_stop_id_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."stops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_stop_id_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."stops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stops" ADD CONSTRAINT "stops_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stops" ADD CONSTRAINT "stops_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_date_depot" ON "orders" USING btree ("delivery_date","depot");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_depot_date" ON "plans" USING btree ("depot","date");--> statement-breakpoint
CREATE INDEX "stops_trip" ON "stops" USING btree ("trip_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trips_plan_vehicle_no" ON "trips" USING btree ("plan_id","vehicle_id","trip_no");