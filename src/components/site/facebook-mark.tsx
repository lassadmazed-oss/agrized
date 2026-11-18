/** The «f» of Facebook, in the site's line style rather than the network's filled logo (0169, 0171). */
export function FacebookMark({ className = "size-4 flex-none" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2.5" y="2.5" width="15" height="15" rx="3.5" />
      <path d="M12.8 6.5h-1.3a2 2 0 0 0-2 2v9M7.5 10.5h5" />
    </svg>
  );
}
