require("dotenv").config();

const os = require("os");
const path = require("path");
const inquirer = require("inquirer");
const axios = require("axios");
const fs = require("fs").promises;
const { Command } = require("commander");
const program = new Command();

const homeDir = os.homedir();
const isWindows = os.type().match(/windows/i);
const sessionFileName = path.join(homeDir, `${isWindows ? "_" : "."}sb-timers-session`);
// console.log("File to keep the session ID:", sessionFileName);

program
  .name("Приложение с таймерами")
  .description("Приложение с авторизацией для управления своими таймерами")
  .version("0.8.0");

program
  .command("signup")
  .description("Регистрация в приложении")
  .action(() => {
    inquirer
      .prompt([
        {
          name: "username",
          message: "Username:",
          type: "input",
        },
        {
          name: "password",
          message: "Password:",
          type: "password",
        },
      ])
      .then(function ({ username, password }) {
        axios
          .post(`${process.env.SERVER}/signup`, {
            username,
            password,
          })
          .then(async function (response) {
            if (response.data.sessionId) {
              fs.writeFile(sessionFileName, response.data.sessionId);

              console.log("Signed up successfully!");
            } else {
              console.log("User already exist");
            }
          })
          .catch(function (error) {
            console.log(error);
          });
      });
  });

program
  .command("login")
  .description("Авторизация в приложении")
  .action(() => {
    inquirer
      .prompt([
        {
          name: "username",
          message: "Username:",
          type: "input",
        },
        {
          name: "password",
          message: "Password:",
          type: "password",
        },
      ])
      .then(function ({ username, password }) {
        axios
          .post(`${process.env.SERVER}/login`, {
            username,
            password,
          })
          .then(async function (response) {
            if (response.data.error) {
              console.log("Wrong username or password!");
            } else {
              fs.writeFile(sessionFileName, response.data.sessionId);
              console.log("Logged in successfully!");
            }
          })
          .catch(function (error) {
            console.log(error);
          });
      });
  });

program
  .command("logout")
  .description("Выход из сессии")
  .action(() => {
    fs.readFile(sessionFileName)
      .then((res) => {
        axios
          .get(`${process.env.SERVER}/logout`, {
            params: {
              sessionId: res,
            },
          })
          .then(async function (response) {
            if (response.data.error) {
              console.log("User is not authorized");
            } else {
              fs.unlink(sessionFileName);
              console.log("Logged out successfully!");
            }
          });
      })
      .catch((err) => console.log(err.message));
  });

program
  .command("start")
  .description("Создание и запуск таймера")
  .argument("<description>", "Название таймера")
  .action((description) => {
    fs.readFile(sessionFileName)
      .then((res) => {
        axios
          .post(`${process.env.SERVER}/api/timers?sessionId=${res}`, {
            description: description,
          })
          .then((response) => {
            if (response.data.error) {
              console.log("User is not authorized");
            } else {
              console.log(`Started timer "${description}", ID: ${response.data.timer}.`);
            }
          });
      })
      .catch(() => console.log("Пользователь не авторизован"));
  });

program
  .command("stop")
  .description("Остановка таймера")
  .argument("<timerId>", "ID таймера")
  .action((timerId) => {
    fs.readFile(sessionFileName)
      .then((res) => {
        axios.post(`${process.env.SERVER}/api/timers/${timerId}/stop/?sessionId=${res}`).then((response) => {
          console.log(response.data);
          if (response.data.error) {
            console.log("User is not authorized");
          } else {
            console.log(`Timer ${response.data.timer._id} stopped.`);
          }
        });
      })
      .catch(() => console.log("Пользователь не авторизован"));
  });

program
  .command("status")
  .description("Остановка таймера")
  .argument("[option]", "Опциональный параметр")
  .action((option) => {
    if (option === undefined) {
      fs.readFile(sessionFileName)
        .then((res) => {
          axios.get(`${process.env.SERVER}/api/timers/?sessionId=${res}&isActive=true`).then((response) => {
            if (response.data.error) {
              console.log("User is not authorized");
            } else {
              const structDatas = [];
              response.data.forEach((timer) => {
                structDatas.push({ ID: timer._id, Task: timer.description, Time: timer.progress });
              });
              console.table(structDatas);
            }
          });
        })
        .catch(() => console.log("Пользователь не авторизован"));
    } else if (option === "old") {
      fs.readFile(sessionFileName)
        .then((res) => {
          axios.get(`${process.env.SERVER}/api/timers/?sessionId=${res}&isActive=false`).then((response) => {
            if (response.data.error) {
              console.log("User is not authorized");
            } else {
              const structDatas = [];
              response.data.forEach((timer) => {
                structDatas.push({ ID: timer._id, Task: timer.description, Time: timer.duration });
              });
              console.table(structDatas);
            }
          });
        })
        .catch(() => console.log("Пользователь не авторизован"));
    } else {
      fs.readFile(sessionFileName)
        .then((res) => {
          axios.get(`${process.env.SERVER}/api/timers/?sessionId=${res}&isActive=true`).then((response) => {
            if (response.data.error) {
              console.log("User is not authorized");
              throw Error("User is not authorized");
            } else {
              let result = response.data.filter((timer) => timer._id === option);

              if (result.length === 0) {
                axios.get(`${process.env.SERVER}/api/timers/?sessionId=${res}&isActive=false`).then((response) => {
                  if (response.data.error) {
                    console.log("User is not authorized");
                  } else {
                    let result = response.data.filter((timer) => timer._id === option);
                    if (result.length === 0) return console.error("Указанный ID таймера не найден");
                    const structDatas = [];
                    result.forEach((timer) => {
                      structDatas.push({ ID: timer._id, Task: timer.description, Time: timer.duration });
                    });
                    console.table(structDatas);
                    return;
                  }
                });
              } else {
                const structDatas = [];
                result.forEach((timer) => {
                  structDatas.push({ ID: timer._id, Task: timer.description, Time: timer.progress });
                });
                console.table(structDatas);
              }
            }
          });
        })
        .catch(() => console.log("Пользователь не авторизован"));
    }
  });

program.parse();
