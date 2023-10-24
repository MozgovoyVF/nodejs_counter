require("dotenv").config();

const express = require("express");
const nunjucks = require("nunjucks");
const { nanoid } = require("nanoid");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const crypto = require("crypto");

const app = express();

const knex = require("knex")({
  client: "pg",
  connection: {
    host: process.env.DB_HOST,
    port: process.env.DB_POST || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
});

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
app.use(cookieParser());

const auth = () => async (req, res, next) => {
  if (!req.cookies["sessionId"]) return next();

  const user = await findUserBySessionId(req.cookies["sessionId"]);
  req.user = user;
  req.sessionId = req.cookies["sessionId"];
  next();
};

const hash = (d) => crypto.createHash("sha256").update(d).digest("base64");

const createUser = async (username, password) => {
  const [userId] = await knex("users")
    .insert({
      username,
      password: hash(password),
    })
    .returning("id");

  return userId;
};

const findUserByUsername = async (username) => {
  return knex("users")
    .select()
    .where({ username })
    .limit(1)
    .then((res) => res[0]);
  // return DB.users.find((u) => u.username === username);
};

const findUserBySessionId = async (sessionId) => {
  const session = await knex("sessions")
    .select("user_id")
    .where({ session_id: sessionId })
    .limit(1)
    .then((res) => res[0]);

  if (!session) {
    return;
  }

  return knex("users")
    .select()
    .where({ id: session.user_id })
    .limit(1)
    .then((res) => res[0]);
};

const createSession = async (userId) => {
  const sessionId = nanoid();

  await knex("sessions").insert({
    user_id: userId,
    session_id: sessionId,
  });

  return sessionId;
};

const deleteSession = async (sessionId) => {
  await knex("sessions").where({ session_id: sessionId }).delete();
};

const createTimer = async (userId, desc) => {
  const [timer] = await knex("timers")
    .insert({
      start: Date.now(),
      end: 0,
      progress: 10000,
      user_id: userId,
      description: desc,
      is_active: true,
    })
    .returning("*");

  return timer;
};

const findUserTimers = async (userId, isActive) => {
  const timers = await knex("timers").select().where({
    user_id: userId,
    is_active: isActive,
  });

  return timers;
};

const switchTimerState = async (timerId) => {
  const [timer] = await knex("timers")
    .where({ id: timerId })
    .update({
      is_active: knex.raw("NOT is_active"),
      end: Date.now(),
    })
    .returning("*");

  return timer;
};

const timerTick = async (timer) => {
  const [updateTimer] = await knex("timers")
    .where({ id: timer.id })
    .update({
      progress: knex.raw("progress - 1000"),
    })
    .returning("*");

  if (updateTimer.progress <= 0) {
    switchTimerState(updateTimer.id);
  }

  return updateTimer;
};

app.get("/", auth(), (req, res) => {
  res.render("index", {
    user: req.user,
    authError: req.query.authError === "true" ? "Wrong username or password" : req.query.authError,
  });
});

app.post("/login", bodyParser.urlencoded({ extended: false }), async (req, res) => {
  const { username, password } = req.body;
  const user = await findUserByUsername(username);

  if (!user || !password || hash(password) !== user.password) return res.redirect("/?authError=true");

  const sessionId = await createSession(user.id);
  res.cookie("sessionId", sessionId, { httpOnly: true }).redirect("/");
});

app.get("/logout", auth(), async (req, res) => {
  if (!req.user) return res.redirect("/");

  await deleteSession(req.sessionId);
  res.clearCookie("sessionId").redirect("/");
});

app.post("/signup", bodyParser.urlencoded({ extended: false }), async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) return res.redirect("/?authError=true");

  let user = await findUserByUsername(username);

  if (user) return res.redirect("/");

  user = await createUser(username, password);
  const sessionId = await createSession(user.id);

  res.cookie("sessionId", sessionId, { httpOnly: true }).redirect("/");
});

app.get("/api/timers", auth(), async (req, res) => {
  if (!req.user) return res.redirect("/");
  const user = await findUserByUsername(req.user.username);

  const timers = await findUserTimers(user.id, req.query.isActive);

  timers.map((timer) => {
    timer.start = Number(timer.start);

    if (!timer.is_active) {
      timer.duration = Math.floor(timer.end - timer.start);
      timer.end = Number(timer.end);
    }
    return timer;
  });

  if (timers.length > 0) {
    timers.map((timer) => {
      return timerTick(timer);
    });
  }
  console.log(timers);
  return res.json(timers);
});

app.post("/api/timers", auth(), async (req, res) => {
  if (!req.body) return res.sendStatus(401);
  const description = req.body.description;

  if (!req.user) return res.redirect("/");

  const timer = createTimer(req.user.id, description);

  return timer;
});

app.post("/api/timers/:id/stop", auth(), async (req, res) => {
  if (!req.user) return res.redirect("/");
  const timer = switchTimerState(req.params.id);
  return res.json(timer);
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`  Listening on http://localhost:${port}`);
});
