type WordmarkProps = {
  className?: string;
  /** Use over a photo or the forest-green band, where the green half would disappear. */
  onDark?: boolean;
};

/** Text version of the AgriZed logo: "Agri" in forest green, "Zed" in gold, serif. */
export function Wordmark({ className = "text-3xl", onDark = false }: WordmarkProps) {
  return (
    <span dir="ltr" className={`inline-block font-display font-bold leading-none tracking-tight ${className}`}>
      <span className={onDark ? "text-paper" : "text-forest"}>Agri</span>
      <span className="bg-linear-to-b from-gold-bright to-gold bg-clip-text text-transparent">Zed</span>
    </span>
  );
}
