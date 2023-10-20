const express = require("express");
const nunjucks = require("nunjucks");
// const { nanoid } = require("nanoid");

const app = express();

nunjucks.configure("views", {
  autoescape: true,
  express: app,
  tags: {
    blockStart: "[%",
    blockEnd: "%]",
    variableStart: "[[",
    variableEnd: "]]",
    commentStart: "[#",
    commentEnd: "#]",
  },
});

app.set("view engine", "njk");

app.use(express.json());
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.render("index");
});

// You can use these initial data
/*
const TIMERS = [
  {
    start: Date.now(),
    description: "Timer 1",
    isActive: true,
    id: nanoid(),
  },
  {
    start: Date.now() - 5000,
    end: Date.now() - 3000,
    duration: 2000,
    description: "Timer 0",
    isActive: false,
    id: nanoid(),
  },
];
*/

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`  Listening on http://localhost:${port}`);
});
