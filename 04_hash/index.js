const fs = require("fs");
const crypto = require("crypto");
const axios = require("axios");

let fileBuf;
let fileSha;

const readFileSafe = (fileName, encoding, exitCode) => {
  return fs.readFileSync(fileName, { encoding: encoding ? "utf8" : "" }, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        console.error("Указанный файл не существует");
        process.exit(exitCode);
      } else {
        console.error(err);
      }
    } else {
      if (!data) {
        console.error("Не удалось прочитать содержимое файла");
        process.exit(exitCode);
      }
    }
  });
};

const readFromWeb = async (fileName, bufferType, exitCode) => {
  let result = await axios
    .get(fileName, {
      responseType: bufferType && "arraybuffer",
    })
    .then((res) => res.data)
    .catch((err) => {
      if (err.response.status === 404) {
        console.error("Указанный файл не существует");
        process.exit(exitCode);
      }
    });

  return result;
};

if (!process.argv[2]) {
  console.error("Не указан путь к файлу");
  process.exit(100);
} else {
  const file = process.argv[2];

  if (process.argv[2].split("//")[0] === "http:" || process.argv[2].split("//")[0] === "https:") {
    readFromWeb(file, true, 100)
      .then((res) => {
        return (fileBuf = res);
      })
      .then(() => {
        return readFromWeb(file + ".sha256", false, 101);
      })
      .then((res) => {
        return (fileSha = res);
      })
      .then(() => {
        const result = crypto.createHash("sha256").update(fileBuf).digest("hex");

        if (result === fileSha.trim()) {
          console.log("Хэши совпадают!");
        } else {
          console.error("Хэши не совпадают");
          process.exit(102);
        }
      });
  } else {
    try {
      fileBuf = readFileSafe(file, false, 100);
    } catch (error) {
      if (error.code === "ENOENT") {
        console.error("Указанный файл не существует");
        process.exit(100);
      }
    }

    try {
      fileSha = readFileSafe(file + ".sha256", true, 101);
    } catch (error) {
      if (error.code === "ENOENT") {
        console.error("Файл с хэшем не существует");
        process.exit(101);
      }
    }

    const result = crypto.createHash("sha256").update(fileBuf).digest("hex");

    if (result === fileSha.trim()) {
      console.log("Хэши совпадают!");
    } else {
      console.error("Хэши не совпадают");
      process.exit(102);
    }
  }
}
