// Load HadCRUT5 monthly global anomalies and re-express them relative to 1850–1900.
// The official CSV stays untouched; every transform happens here at load time.

export const DATA_URL =
  "../data/HadCRUT.5.2.0.0.analysis.summary_series.global.monthly.csv";

const BASE_START = 1850;
const BASE_END = 1900;
const WINDOW = 30; // years in the running mean: y−15 … y+14

export async function loadData() {
  const raw = await d3.csv(DATA_URL, (d) => {
    const [year, month] = d.Time.split("-").map(Number);
    return {
      year,
      month,
      value: +d["Anomaly (deg C)"],
      lower: +d["Lower confidence limit (2.5%)"],
      upper: +d["Upper confidence limit (97.5%)"],
    };
  });

  // The file is relative to 1961–1990; shift everything onto the 1850–1900 mean.
  const baseRows = raw.filter((d) => d.year >= BASE_START && d.year <= BASE_END);
  const base = d3.mean(baseRows, (d) => d.value);

  const monthly = raw.map((d) => ({
    year: d.year,
    month: d.month,
    t: d.year + (d.month - 0.5) / 12, // decimal year at mid-month
    anomaly: d.value - base,
    lower: d.lower - base,
    upper: d.upper - base,
  }));

  const annual = d3
    .groups(monthly, (d) => d.year)
    .map(([year, months]) => {
      const warmest = d3.greatest(months, (d) => d.anomaly);
      return {
        year,
        anomaly: d3.mean(months, (d) => d.anomaly),
        n: months.length,
        complete: months.length === 12,
        months,
        warmestMonth: warmest,
      };
    });

  const byYear = new Map(annual.map((d) => [d.year, d]));

  // 30-year centered running mean, only where all 30 years are complete.
  for (const d of annual) {
    const window = d3.range(d.year - WINDOW / 2, d.year + WINDOW / 2).map((y) => byYear.get(y));
    d.rm30 = window.every((w) => w && w.complete) ? d3.mean(window, (w) => w.anomaly) : null;
  }

  const complete = annual.filter((d) => d.complete);
  const rm30 = annual.filter((d) => d.rm30 !== null);
  const data = {
    base,
    monthly,
    annual,
    byYear,
    rm30,
    firstYear: annual[0].year,
    lastYear: annual[annual.length - 1].year,
    latestMonth: monthly[monthly.length - 1],
    warmestYear: d3.greatest(complete, (d) => d.anomaly),
    warmestMonth: d3.greatest(monthly, (d) => d.anomaly),
    monthsAbove15: monthly.filter((d) => d.anomaly > 1.5),
    rm30Last: rm30[rm30.length - 1],
  };

  runChecks(data, baseRows.length);
  return data;
}

function runChecks(data, baseMonths) {
  const baseMean = d3.mean(
    data.monthly.filter((d) => d.year >= BASE_START && d.year <= BASE_END),
    (d) => d.anomaly,
  );
  const hasNaN = data.monthly.some((d) => [d.anomaly, d.lower, d.upper].some(Number.isNaN));
  const shortYears = data.annual.filter((d) => !d.complete).map((d) => d.year);
  const rm30Max = d3.max(data.rm30, (d) => d.rm30);

  console.groupCollapsed("HadCRUT5 sanity checks");
  console.log(`Offset from 1961–1990 to 1850–1900: ${data.base.toFixed(4)} °C over ${baseMonths} months`);
  console.log(`Rebaselined 1850–1900 mean: ${baseMean.toFixed(4)} (expect 0.000 ± 0.001)`, Math.abs(baseMean) < 0.001 ? "OK" : "FAIL");
  console.log("NaN values:", hasNaN ? "FAIL" : "none");
  console.log("Years with fewer than 12 months:", shortYears, shortYears.every((y) => y === data.lastYear) ? "OK" : "FAIL");
  console.log(`Months above 1.5 °C: ${data.monthsAbove15.length}; highest 30-yr mean: ${rm30Max.toFixed(2)} °C`,
    data.monthsAbove15.length > 0 && rm30Max < 1.5 ? "OK" : "CHECK");
  console.groupEnd();
}
