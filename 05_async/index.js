const axios = require("axios");

let names;

if (process.argv.length <= 2) {
  console.error("Введите имена персонажей из вселенной STARWARS");
  process.exit(100);
} else {
  names = process.argv.filter((arg) => !arg.startsWith("/", 0));
}

const findPeople = async () => {
  const result = await Promise.all(
    names.map((name) => {
      return axios
        .get(`https://swapi.dev/api/people/?search=${name}`)
        .then((res) => {
          if (res.data.count === 0) {
            console.warn(`Возникла ошибка при поиске персонажа ${name}`);
          }
          return res.data;
        })
        .catch(() => {
          console.error("Возникла ошибка при поиске персонажа " + name);
          return { count: 0 };
        });
    })
  );

  let characters = [];
  let minHeight;
  let maxHeight;

  result
    .filter((search) => search.count !== 0)
    .map((req) => {
      req.results.forEach((el) => {
        characters.push(el);
        if (!minHeight && !maxHeight) {
          maxHeight = { name: el.name, height: el.height };
          minHeight = { name: el.name, height: el.height };
        } else if (Number(el.height) > Number(maxHeight.height)) {
          maxHeight.name = el.name;
          maxHeight.height = el.height;
        } else if (Number(el.height) < Number(minHeight.height)) {
          minHeight.name = el.name;
          minHeight.height = el.height;
        }
      });
    });

  let sortedNames = characters.sort((a, b) => a.name.localeCompare(b.name));

  console.log(`
Total results: ${sortedNames.length}.

All: ${sortedNames.map((el) => el.name).join(", ")}.

Min height: ${minHeight.name}, ${minHeight.height} cm.

Max height: ${maxHeight.name}, ${maxHeight.height} cm.
  `);
};

findPeople();
