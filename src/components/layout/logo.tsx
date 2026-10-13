export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <g fill="#fff">
        <path d="M7 7h8v8H7zM9 9v4h4V9z" fillRule="evenodd" />
        <path d="M17 7h8v8h-8zm2 2v4h4V9z" fillRule="evenodd" />
        <path d="M7 17h8v8H7zm2 2v4h4v-4z" fillRule="evenodd" />
        <rect x="17" y="17" width="3" height="3" rx="0.6" />
        <rect x="22" y="17" width="3" height="3" rx="0.6" />
        <rect x="17" y="22" width="3" height="3" rx="0.6" />
        <rect x="22" y="22" width="3" height="3" rx="0.6" />
      </g>
    </svg>
  );
}
