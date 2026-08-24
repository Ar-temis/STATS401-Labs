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
