// One number format for the whole UI: thousands separated from 1,000 upwards, English style.
const integer = new Intl.NumberFormat("en-US", { useGrouping: "always", maximumFractionDigits: 0 });

export function formatTokens(value) {
  return integer.format(Number(value));
}
