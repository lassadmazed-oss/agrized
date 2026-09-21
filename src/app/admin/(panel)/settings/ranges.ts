/**
 * Accepted range of each integer setting: the page puts it on the input, the Server Action enforces it.
 * Integer settings not listed here accept 0 to 1,000,000.
 */
export const INTEGER_RANGES: Record<string, [number, number]> = {
  // The progress bar divides by this. Zero is allowed and means «no reference»: the counter then draws its four
  // figures and no bar, which is the owner's position — the goal is not a number to reach (0053). What the guard
  // is for is the ceiling, and the fact that an emptied number field saves as 0 rather than as nothing.
  "million.goal": [0, 10_000_000],
  "projects.installment_examples": [1, 5],
  "projects.listing_limit": [20, 1000],
  "projects.gallery_max": [1, 60],
  // Report v3 §8: the system cap on payment durations, in months (agrized-db's tree pricing).
  "pricing.max_months": [12, 120],
  "antispam.max_requests_per_ip_per_hour": [1, 1000],
  "antispam.max_requests_per_phone_per_day": [1, 100],
  "antispam.max_land_offers_per_ip_per_day": [1, 100],
  "land_offer.max_file_size_mb": [1, 20],
  "land_offer.max_files": [0, 50],
};
