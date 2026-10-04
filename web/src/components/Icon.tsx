// Line icons from the style guide (1.8 px stroke). Never emoji.
const P: Record<string, React.ReactNode> = {
  orders: <path d="M4 5h16M4 12h16M4 19h10" />,
  truck: <><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>,
  pin: <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  alert: <><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v4M12 17h.01" /></>,
  check: <path d="M4 12l5 5L20 6" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  wifiOff: <path d="M2 8.5a15 15 0 0 1 4-2.4M22 8.5A15 15 0 0 0 10.5 5M5 12.5a10 10 0 0 1 3-1.8M8.5 16a5 5 0 0 1 7 0M12 20h.01M3 3l18 18" />,
  camera: <><path d="M4 7h3l2-2h6l2 2h3v12H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  box: <><path d="M3 7l9-4 9 4v10l-9 4-9-4z" /><path d="M3 7l9 4 9-4M12 11v10" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.6 3.4M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  snow: <path d="M12 2v20M4.9 6.5l14.2 11M19.1 6.5 4.9 17.5" />,
  sync: <><path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 13a8 8 0 0 0 14.5 4.5L20 16" /><path d="M4 4v4h4M20 20v-4h-4" /></>,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  next: <path d="M5 12h14M13 6l6 6-6 6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v5h1" /></>,
  logout: <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11" />,
  store: <><path d="M4 10l8-6 8 6v10H4z" /><path d="M9 20v-6h6v6" /></>,
};
export function Icon({ name, size = 18, style, className }: { name: keyof typeof P | string; size?: number; style?: React.CSSProperties; className?: string }) {
  return <svg className={`ico ${className ?? ''}`} viewBox="0 0 24 24" style={{ width: size, height: size, ...style }} aria-hidden="true">{P[name]}</svg>;
}
