export function Logo({ size = 30, dark = false }: { size?: number; dark?: boolean }) {
  return (
    <svg viewBox="0 0 40 40" style={{ width: size, height: size }} aria-hidden="true">
      <rect x="2" y="2" width="36" height="36" rx="9" fill={dark ? '#16181D' : '#F2B705'} />
      <path d="M11 27l6-14 5 9 3-5 5 10" stroke={dark ? '#F2B705' : '#16181D'} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
