function currentDateTime() {
  const date = new Date().toISOString().replace(/T/, " ").replace(/\..+/, "");

  return {
    date: date.split(" ")[0],
    time: date.split(" ")[1],
  };
}

module.exports = {
  currentDateTime,
};
