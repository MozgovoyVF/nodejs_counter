const express = require("express");
const nunjucks = require("nunjucks");
const { nanoid } = require("nanoid");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const crypto = require("crypto");

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
app.use(cookieParser());

const auth = () => async (req, res, next) => {
  if (!req.cookies["sessionId"]) return next();

  const user = await findUserBySessionId(req.cookies["sessionId"]);
  req.user = user;
  req.sessionId = req.cookies["sessionId"];
  next();
};

const hash = (d) => crypto.createHash("sha256").update(d).digest("base64");

const DB = {
  users: [
    {
      _id: nanoid(),
      username: "admin",
      password: hash("pwd007"),
    },
    {
      _id: nanoid(),
      username: "vlad",
      password: hash("pwd007"),
    },
  ],
  sessions: {},
  timers: [],
};

const createUser = async (username, password) => {
  DB.users.push({
    _id: nanoid(),
    username,
    password: hash(password),
  });

  const user = DB.users[DB.users.length - 1];

  return user;
};

const findUserByUsername = async (username) => {
  return DB.users.find((u) => u.username === username);
};

const findUserBySessionId = async (sessionId) => {
  const userId = DB.sessions[sessionId];
  if (!userId) {
    return;
  }
  return DB.users.find((u) => u._id === userId);
};

const createSession = async (userId) => {
  const sessionId = nanoid();
  DB.sessions[sessionId] = userId;
  return sessionId;
};

const deleteSession = async (sessionId) => {
  delete DB.sessions[sessionId];
};

const createTimer = async (userId, desc) => {
  DB.timers.push({
    id: nanoid(),
    start: Date.now(),
    end: 0,
    progress: 10000,
    duration: 0,
    userId,
    description: desc,
    isActive: true,
  });

  return DB.timers[DB.timers.length - 1];
};

const findUserTimers = (userId, isActive) => {
  const timers = [];

  DB.timers.forEach((timer) => {
    if (timer.userId === userId && timer.isActive.toString() === isActive.toString()) {
      timers.push(timer);
    }
  });

  return timers;
};

const switchTimerState = (timerId) => {
  DB.timers.map((timer) => {
    if (timer.id === timerId) {
      timer.isActive = !timer.isActive;
      timer.end = Date.now();
      timer.duration = Math.floor(timer.end - timer.start);
      return timer;
    }
  });
};

const timerTick = (timer) => {
  DB.timers.map((t) => {
    if (t.id === timer.id) {
      t.progress -= 1000;
      if (timer.progress === 0) {
        return switchTimerState(t.id);
      }
      return t;
    }
  });
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

  const sessionId = await createSession(user._id);
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

  const sessionId = await createSession(user._id);
  res.cookie("sessionId", sessionId, { httpOnly: true }).redirect("/");
});

app.get("/api/timers", auth(), async (req, res) => {
  if (!req.user) return res.redirect("/");
  const user = await findUserByUsername(req.user.username);

  const timers = findUserTimers(user._id, req.query.isActive);

  if (timers.length > 0) {
    timers.map((timer) => {
      return timerTick(timer);
    });
  }

  return res.json(timers);
});

app.post("/api/timers", auth(), async (req, res) => {
  if (!req.body) return res.sendStatus(401);
  const description = req.body.description;

  if (!req.user) return res.redirect("/");

  const timer = createTimer(req.user._id, description);

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
