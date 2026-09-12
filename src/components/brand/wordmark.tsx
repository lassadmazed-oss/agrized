type WordmarkProps = {
  className?: string;
};

/** Text version of the AgriZed logo: "Agri" in forest green, "Zed" in gold, serif. */
export function Wordmark({ className = "text-3xl" }: WordmarkProps) {
  return (
    <span dir="ltr" className={`inline-block font-display font-bold leading-none tracking-tight ${className}`}>
      <span className="text-forest">Agri</span>
      <span className="bg-linear-to-b from-gold-bright to-gold bg-clip-text text-transparent">Zed</span>
    </span>
  );
}
