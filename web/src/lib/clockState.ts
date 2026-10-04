// The demo clock's in-process state, kept free of database imports so the schema can use it.
//
// In demo mode the whole system runs on one shared "story time" (the demo day), not the
// computer's clock: it starts the evening before the demo day, runs at normal speed, and moves
// forward when field work happens or when the presenter jumps it. Outside demo mode the offset
// is zero, so story time is simply real time.
export const DEMO_CLOCK = process.env.DEMO_MODE !== 'false';

let offsetMs = 0; // story time minus real time

export function setClockOffset(ms: number) { offsetMs = DEMO_CLOCK ? ms : 0; }
export function clockOffset() { return offsetMs; }
/** The current time in the story (synchronous; refreshed from the database on every API request). */
export function demoNow(): Date { return new Date(Date.now() + offsetMs); }
