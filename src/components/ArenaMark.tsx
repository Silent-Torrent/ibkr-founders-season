interface ArenaMarkProps {
  className?: string
}

export function ArenaMark({ className }: ArenaMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      viewBox="0 0 24 24"
    >
      <circle
        cx="12"
        cy="12"
        fill="none"
        opacity="0.52"
        r="9"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M5 12H19"
        fill="none"
        opacity="0.55"
        stroke="#8e9dab"
        strokeLinecap="round"
        strokeWidth="1"
      />
      <path
        d="M5.25 15.75L8.75 12.25L11.25 13.75L15.25 8.25L18.75 10.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  )
}
