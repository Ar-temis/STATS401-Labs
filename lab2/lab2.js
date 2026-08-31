const width = 800;
const height = 500;

const margin = {
  top: 40,
  right: 170,
  bottom: 70,
  left: 70
};

const tooltip = d3.select("#tooltip");

d3.csv(
  "../data/cities_multivariate.csv",
  d => ({
    name: d.city,
    population: +d.population,
    temperature: +d.temp_c,
    development_level: d.development_level,
    region: d.region
  })
)
  .then(data => {

    const svg = d3.select("#chart")
      .append("svg")
      .attr("width", width)
      .attr("height", height);

    const xScale = d3.scaleLinear()
      .domain(d3.extent(data, d => d.population))
      .nice()
      .range([
        margin.left,
        width - margin.right
      ]);

    const yScale = d3.scaleLinear()
      .domain(d3.extent(data, d => d.temperature))
      .nice()
      .range([
        height - margin.bottom,
        margin.top
      ]);

    const regions = Array.from(
      new Set(data.map(d => d.region))
    );

    const colorScale = d3.scaleOrdinal()
      .domain(regions)
      .range(d3.schemeTableau10);

    const levels = [
      "Low",
      "Medium",
      "High"
    ];

    const shapeScale = d3.scaleOrdinal()
      .domain(levels)
      .range([
        d3.symbolCircle,
        d3.symbolSquare,
        d3.symbolTriangle
      ]);

    const symbol = d3.symbol()
      .size(160);

    svg.append("g")
      .attr(
        "transform",
        `translate(0, ${height - margin.bottom})`
      )
      .call(d3.axisBottom(xScale));

    svg.append("g")
      .attr(
        "transform",
        `translate(${margin.left}, 0)`
      )
      .call(d3.axisLeft(yScale));

    svg.append("text")
      .attr(
        "x",
        (margin.left + width - margin.right) / 2
      )
      .attr("y", height - 25)
      .attr("text-anchor", "middle")
      .text("Population (millions)");

    svg.append("text")
      .attr(
        "transform",
        `rotate(-90) translate(${-(margin.top + height - margin.bottom) / 2}, 20)`
      )
      .attr("text-anchor", "middle")
      .text("Temperature (°C)");

    svg.selectAll(".city-point")
      .data(data)
      .join("path")
      .attr("class", "city-point")
      .attr(
        "transform",
        d => `translate(${xScale(d.population)}, ${yScale(d.temperature)})`
      )
      .attr(
        "d",
        d => symbol.type(
          shapeScale(d.development_level)
        )()
      )
      .attr(
        "fill",
        d => colorScale(d.region)
      )
      .attr("opacity", 0.8)
      .on("mouseover", function(event, d) {

        tooltip
          .style("opacity", 1)
          .html(`
                    <strong>${d.name}</strong><br>
                    Population: ${d.population} million<br>
                    Temperature: ${d.temperature} °C<br>
                    Development Level: ${d.development_level}<br>
                    Region: ${d.region}
                `);
      })
      .on("mousemove", function(event) {

        tooltip
          .style(
            "left",
            `${event.pageX + 10}px`
          )
          .style(
            "top",
            `${event.pageY + 10}px`
          );
      })
      .on("mouseout", function() {

        tooltip
          .style("opacity", 0);
      });

    svg.selectAll(".city-label")
      .data(data)
      .join("text")
      .attr("class", "city-label")
      .attr(
        "x",
        d => xScale(d.population)
      )
      .attr(
        "y",
        d => yScale(d.temperature) + 22
      )
      .attr("text-anchor", "middle")
      .attr("font-size", 11)
      .attr("fill", "#555")
      .text(d => d.name);

    const legend = svg.append("g")
      .attr(
        "transform",
        `translate(${width - margin.right + 30}, ${margin.top})`
      );

    legend.append("text")
      .attr("y", 0)
      .attr("font-weight", "bold")
      .text("Region");

    const regionItems = legend.selectAll(".region-item")
      .data(regions)
      .join("g")
      .attr("class", "region-item")
      .attr(
        "transform",
        (d, i) => `translate(0, ${20 + i * 22})`
      );

    regionItems.append("circle")
      .attr("cx", 7)
      .attr("cy", -4)
      .attr("r", 7)
      .attr(
        "fill",
        d => colorScale(d)
      )
      .attr("opacity", 0.8);

    regionItems.append("text")
      .attr("x", 22)
      .text(d => d);

    const shapeLegend = legend.append("g")
      .attr(
        "transform",
        `translate(0, ${40 + regions.length * 22})`
      );

    shapeLegend.append("text")
      .attr("font-weight", "bold")
      .text("Development Level");

    const levelItems = shapeLegend.selectAll(".level-item")
      .data(levels)
      .join("g")
      .attr("class", "level-item")
      .attr(
        "transform",
        (d, i) => `translate(0, ${20 + i * 22})`
      );

    levelItems.append("path")
      .attr(
        "transform",
        "translate(7, -4)"
      )
      .attr(
        "d",
        d => symbol.type(shapeScale(d))()
      )
      .attr("fill", "#777");

    levelItems.append("text")
      .attr("x", 22)
      .text(d => d);
  });
