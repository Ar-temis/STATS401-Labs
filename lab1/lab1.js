async function loadData() {
  return await d3.csv(
    "../data/students.csv",
    d => ({
      name: d.name,
      score: Number(d.score)
    })
  );
}

const MAX_SCORE = 100;
const SQUARE_HEIGHT_MULTIPLIER = 2;
const SQUARE_WIDTH = 30;
const MARGIN = 50;
const PADDING_LEFT = 50;

const svg = d3.select("#chart")
  .append("svg")
  .attr("width", 1000)
  .attr("height", 340);


async function draw() {
  const students = await loadData();

  console.log(students);

  svg.selectAll("students")
    .data(students)
    .join("rect")
    .attr("x", (d, i) => (PADDING_LEFT + i * (SQUARE_WIDTH + MARGIN)))
    .attr("y", (d, j) => ((MAX_SCORE - d.score) * SQUARE_HEIGHT_MULTIPLIER))
    .attr("width", SQUARE_WIDTH)
    .attr("height", (d, j) => (d.score * SQUARE_HEIGHT_MULTIPLIER))
    .attr("fill", "steelblue");

  svg.selectAll("text.label")
    .data(students)
    .join("text")
    .attr("class", "label")
    .attr("x", (d, i) => PADDING_LEFT + i * (SQUARE_WIDTH + MARGIN) + SQUARE_WIDTH / 2)
    .attr("y", MAX_SCORE * SQUARE_HEIGHT_MULTIPLIER + 20)
    .attr("text-anchor", "middle")
    .text(d => `${d.name} (${d.score})`);
}

draw();
