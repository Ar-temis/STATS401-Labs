function createCartogram(features, valueOf, options = {}) {
  const remoteDistance = options.remoteDistance ?? 120;

  const index = new Map();
  const xs = [];
  const ys = [];

  function vertexId(p) {
    const key = `${p[0]},${p[1]}`;
    let id = index.get(key);
    if (id === undefined) {
      id = xs.length;
      index.set(key, id);
      xs.push(p[0]);
      ys.push(p[1]);
    }
    return id;
  }

  const countries = features.map(f => {
    const polys =
      f.geometry.type === "Polygon"
        ? [f.geometry.coordinates]
        : f.geometry.coordinates;

    return {
      feature: f,
      value: valueOf(f),
      polygons: polys.map(poly => poly.map(ring => ring.map(vertexId)))
    };
  });

  const X = Float64Array.from(xs);
  const Y = Float64Array.from(ys);

  function ringArea(ring) {
    let a = 0;
    for (let i = 0, n = ring.length - 1; i < n; i++) {
      const p = ring[i];
      const q = ring[i + 1];
      a += X[p] * Y[q] - X[q] * Y[p];
    }
    return a / 2;
  }

  function polygonStats(poly) {
    const outer = poly[0];
    let signed = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0, n = outer.length - 1; i < n; i++) {
      const p = outer[i];
      const q = outer[i + 1];
      const c = X[p] * Y[q] - X[q] * Y[p];
      signed += c;
      cx += (X[p] + X[q]) * c;
      cy += (Y[p] + Y[q]) * c;
    }
    let area = Math.abs(signed / 2);
    const centroid =
      signed === 0
        ? [X[outer[0]], Y[outer[0]]]
        : [cx / (3 * signed), cy / (3 * signed)];
    for (let h = 1; h < poly.length; h++) {
      area -= Math.abs(ringArea(poly[h]));
    }
    return { area: Math.max(area, 0), centroid };
  }

  const units = [];

  countries.forEach(country => {
    const stats = country.polygons.map(polygonStats);
    const total = d3.sum(stats, s => s.area);
    if (total <= 0) return;

    const main = d3.greatestIndex(stats, s => s.area);
    const [mx, my] = stats[main].centroid;

    const mainUnit = { polygons: [], share: 0 };
    const extra = [];

    country.polygons.forEach((poly, i) => {
      const s = stats[i];
      const far =
        Math.hypot(s.centroid[0] - mx, s.centroid[1] - my) > remoteDistance;
      if (far && s.area / total > 0.02) {
        extra.push({ polygons: [poly], share: s.area / total });
      } else if (!far) {
        mainUnit.polygons.push(poly);
        mainUnit.share += s.area / total;
      }
    });

    [mainUnit, ...extra].forEach(u => {
      if (u.polygons.length) {
        units.push({
          polygons: u.polygons,
          value: country.value * u.share
        });
      }
    });
  });

  const totalValue = d3.sum(units, u => u.value);

  let lastMeanError = NaN;
  let iteration = 0;

  function measure() {
    let totalArea = 0;
    units.forEach(u => {
      let area = 0;
      let cx = 0;
      let cy = 0;
      u.polygons.forEach(poly => {
        const s = polygonStats(poly);
        area += s.area;
        cx += s.centroid[0] * s.area;
        cy += s.centroid[1] * s.area;
      });
      u.area = area;
      u.cx = area > 0 ? cx / area : X[u.polygons[0][0][0]];
      u.cy = area > 0 ? cy / area : Y[u.polygons[0][0][0]];
      totalArea += area;
    });

    let errorSum = 0;
    let weighted = 0;
    units.forEach(u => {
      u.desired = (totalArea * u.value) / totalValue;
      u.radius = Math.sqrt(u.area / Math.PI);
      u.mass = Math.sqrt(u.desired / Math.PI) - u.radius;
      const big = Math.max(u.area, u.desired);
      const small = Math.max(Math.min(u.area, u.desired), 1e-9);
      u.sizeError = big / small;
      errorSum += u.sizeError;
      weighted += Math.abs(u.area - u.desired);
    });

    lastMeanError = weighted / (2 * totalArea);
    return errorSum / units.length;
  }

  function step() {
    const meanSizeError = measure();
    const reduction = 1 / (1 + meanSizeError);
    const n = X.length;
    const m = units.length;

    const ucx = new Float64Array(m);
    const ucy = new Float64Array(m);
    const ur = new Float64Array(m);
    const um = new Float64Array(m);
    units.forEach((u, j) => {
      ucx[j] = u.cx;
      ucy[j] = u.cy;
      ur[j] = u.radius;
      um[j] = u.mass;
    });

    for (let i = 0; i < n; i++) {
      const x = X[i];
      const y = Y[i];
      let dx = 0;
      let dy = 0;
      for (let j = 0; j < m; j++) {
        const ex = x - ucx[j];
        const ey = y - ucy[j];
        const dist = Math.sqrt(ex * ex + ey * ey);
        if (dist === 0) continue;
        const r = ur[j];
        const ratio = dist / r;
        const force =
          dist > r
            ? (um[j] * r) / dist
            : um[j] * ratio * ratio * (4 - 3 * ratio);
        const f = (force * reduction) / dist;
        dx += ex * f;
        dy += ey * f;
      }
      X[i] = x + dx;
      Y[i] = y + dy;
    }

    iteration += 1;
    measure();
  }

  function toCoords(ring) {
    return ring.map(id => [X[id], Y[id]]);
  }

  function outFeatures() {
    return countries.map(c => ({
      type: "Feature",
      properties: c.feature.properties,
      geometry: {
        type: "MultiPolygon",
        coordinates: c.polygons.map(poly => poly.map(toCoords))
      }
    }));
  }

  function areaShares() {
    let total = 0;
    const byCountry = countries.map(c => {
      const a = d3.sum(c.polygons, p => polygonStats(p).area);
      total += a;
      return [c.feature.properties.iso3, a];
    });
    return new Map(byCountry.map(([k, a]) => [k, a / total]));
  }

  measure();

  return {
    step,
    features: outFeatures,
    areaShares,
    meanError: () => lastMeanError,
    iteration: () => iteration,
    vertexCount: X.length,
    unitCount: units.length
  };
}

if (typeof module !== "undefined") {
  module.exports = { createCartogram };
}
