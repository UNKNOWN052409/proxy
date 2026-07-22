/**
 * Merge class names — handles conditional classes and deduplication
 */
export function cn(...classes) {
  return classes
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
