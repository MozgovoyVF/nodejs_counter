const { currentDateTime } = require("./date");

console.log("Today is", currentDateTime().date, "the current time is", currentDateTime().time);
