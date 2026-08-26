async function loadData() {
  return await d3.csv(
    "../data/students.csv",
    d => ({
      name: d.name,
      score: Number(d.score)
    })
  );
}

const MAX_SQUARES = 100;
const MAX_SCORE = 100;
function relativeScore(student) {
  return Math.floor(student.score / MAX_SCORE * MAX_SQUARES);
}

const svg = d3.select("#chart")
  .append("svg")
  .attr("width", 1000)
  .attr("height", 340);

const SQUARE_HEIGHT = 2;
const SQUARE_WIDTH = 30;
const MARGIN = 50;


async function draw() {
  const students = await loadData();

  const columns = svg.selectAll("g.student")
    .data(students)
    .join("g")
    .attr("class", "student")
    .attr("transform", (d, i) => `translate(${i * (SQUARE_WIDTH + MARGIN)}, 0)`);

  columns.selectAll("rect")
    .data(d => d3.range(relativeScore(d)))
    .join("rect")
    .attr("x", 0)
    .attr("y", (d, j, nodes) => (MAX_SQUARES - nodes.length + j) * (SQUARE_HEIGHT))
    .attr("width", SQUARE_WIDTH)
    .attr("height", SQUARE_HEIGHT)
    .attr("fill", "steelblue");

  columns.selectAll("text.label")
    .data(d => [d])
    .join("text")
    .attr("class", "label")
    .attr("x", SQUARE_WIDTH / 2)
    .attr("y", MAX_SQUARES * SQUARE_HEIGHT + 20)
    .attr("text-anchor", "middle")
    .text(d => `${d.name} (${d.score})`);
}

draw();
