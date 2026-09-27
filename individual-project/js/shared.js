// Encodings shared by both views, so a year or a °C value looks the same everywhere.

export const THEME = {
  panel: "#15181d",
};

// One °C domain for the timeline's y and the spiral's radius. It must include 2.0 °C.
export const Y_DOMAIN = [-0.8, 2.1];
export const SPIRAL_CENTER = -1; // a polar layout can't put negative values below zero

export const THRESHOLDS = [
  { value: 1.5, label: "1.5°C Paris limit (long-term average)", short: "1.5°C Paris limit" },
  { value: 2.0, label: "2.0°C", short: "2.0°C" },
];

// Viridis for year. t starts at 0.3 so the earliest (purple-blue) years stay
// visible on the dark panel instead of sinking into it.
export function yearColor(firstYear, lastYear) {
  const t = d3.scaleLinear().domain([firstYear, lastYear]).range([0.3, 1]);
  return (year) => d3.interpolateViridis(t(year));
}

export function fmtSigned(v, digits = 2) {
  const s = Math.abs(v).toFixed(digits);
  if (+s === 0) return s;
  return (v > 0 ? "+" : "−") + s;
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
