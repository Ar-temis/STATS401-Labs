console.log("Hello STATS 401!");

let course = "STATS 401";
let students = 40;

console.log(course);
console.log(students);

let data = [10, 20, 30, 40, 50];

console.log(data);

let student = {
  name: "Alice",
  score: 85
};

console.log(student.name);
console.log(student.score);

students = [
  { name: "Alice", score: 85 },
  { name: "Bob", score: 72 },
  { name: "Carol", score: 91 }
];

console.log(students);

console.log("D3 version:", d3.version);

d3.select("#message")
  .text("This text was changed using D3!");

d3.select("#content")
  .append("p")
  .text("This paragraph was created using D3.");

const content = d3.select("#content");

content.append("h3")
  .text("My Dataset");

content.append("p")
  .text("The dataset contains student scores.");

d3.select("#numbers")
  .selectAll("p")
  .data(data)
  .join("p")
  .text(d => `Value: ${d}`);

const svg = d3.select("#svg-demo")
  .append("svg")
  .attr("width", 600)
  .attr("height", 300);

svg.append("circle")
  .attr("cx", 100)
  .attr("cy", 100)
  .attr("r", 40)
  .attr("fill", "steelblue");

svg.append("rect")
  .attr("x", 200)
  .attr("y", 60)
  .attr("width", 120)
  .attr("height", 80)
  .attr("fill", "orange");

svg.selectAll("circle")
  .data(data)
  .join("circle")
  .attr("cx", (d, i) => 60 + i * 100)
  .attr("cy", 100)
  .attr("r", d => d / 2)
  .attr("fill", "steelblue");
