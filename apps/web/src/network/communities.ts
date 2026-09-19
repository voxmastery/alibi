/** Community colours for the network view.
 *
 * The API hands each node a `community` number (0 = not in a community). The colour is only ever
 * used for the thin ring around a node, never for its fill: the fill belongs to the risk band, and
 * two colour scales fighting over the same circle would say nothing. The hues are muted on purpose
 * so a dozen rings still read as one drawing on the paper background.
 */

/** Soft hues, ordered so neighbouring community ids never look alike. */
export const COMMUNITY_COLOURS: readonly string[] = [
  "#5b8cc7", // slate blue
  "#c97b4e", // terracotta
  "#5aa189", // sea green
  "#9a7bc0", // mauve
  "#bfa04a", // ochre
  "#c06b8a", // rose
  "#5f9bb0", // cyan slate
  "#8a9a4f", // olive
  "#b0705e", // clay
  "#7b86b8", // periwinkle
];

/** The line colour for a node that belongs to no community. */
export const NO_COMMUNITY_COLOUR = "#b9b2a6";

/** True when the node sits in a community the API found worth marking. */
export function hasCommunity(community: number): boolean {
  return Number.isFinite(community) && community > 0;
}

/**
 * Deterministic colour for a community id: the same id always gets the same hue, in this browser
 * and the next, so a screenshot taken a month apart is still comparable.
 */
export function communityColour(community: number): string {
  if (!hasCommunity(community)) return NO_COMMUNITY_COLOUR;
  const size = COMMUNITY_COLOURS.length;
  const index = (Math.floor(community) - 1) % size;
  return COMMUNITY_COLOURS[index < 0 ? index + size : index] ?? NO_COMMUNITY_COLOUR;
}
