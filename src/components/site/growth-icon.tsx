type GrowthIconProps = {
  code: string;
  className?: string;
};

/** Growth stage of each project type, from bare land to a productive olive tree. */
export function GrowthIcon({ code, className = "size-10" }: GrowthIconProps) {
  const common = {
    viewBox: "0 0 32 32",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };

  switch (code) {
    case "bare_land":
      return (
        <svg {...common}>
          <path d="M4 25h24M8 29h16" />
          <path d="M16 25v-5" />
          <path d="M16 20c0-3 2-5 5-5 0 3-2 5-5 5z" />
        </svg>
      );
    case "young_olive":
      return (
        <svg {...common}>
          <path d="M4 28h24" />
          <path d="M16 28V13" />
          <path d="M16 19c-4 0-6-2-6-5 4 0 6 2 6 5z" />
          <path d="M16 15c0-3.5 2.5-5.5 6-5.5 0 3.5-2.5 5.5-6 5.5z" />
        </svg>
      );
    case "near_production":
      return (
        <svg {...common}>
          <path d="M4 29h24" />
          <path d="M16 29v-8" />
          <ellipse cx="16" cy="14" rx="8.5" ry="6.5" />
        </svg>
      );
    case "productive":
      return (
        <svg {...common}>
          <path d="M4 29h24" />
          <path d="M16 29v-8" />
          <ellipse cx="16" cy="14" rx="8.5" ry="6.5" />
          <circle cx="12.5" cy="14.5" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="17.5" cy="11.5" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="19" cy="16.5" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M6 26C10 14 18 8 26 6c-2 8-8 16-20 20z" />
          <path d="M6 26l9-9" />
        </svg>
      );
  }
}
