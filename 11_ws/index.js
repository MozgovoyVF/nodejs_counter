require("dotenv").config();

const express = require("express");
const WebSocket = require("ws");
const http = require("http");
const nunjucks = require("nunjucks");
const { nanoid } = require("nanoid");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let clients = new Map();

const clientPromise = MongoClient.connect(process.env.DB_URI, {
  useUnifiedTopology: true,
  maxPoolSize: 10,
});

app.use(async (req, res, next) => {
  try {
    let client = await clientPromise;
    req.db = client.db("homework");
    next();
  } catch (err) {
    next(err);
  }
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

  const user = await findUserBySessionId(req.db, req.cookies["sessionId"]);

  req.user = user;
  req.sessionId = req.cookies["sessionId"];
  next();
};

const hash = (d) => crypto.createHash("sha256").update(d).digest("base64");

wss.on("connection", async (ws) => {
  let client = await clientPromise;
  let db = client.db("homework");

  setInterval(async () => {
    for (const userId of clients.keys()) {
      const activeTimers = await findUserTimers(db, new ObjectId(userId), "true").then((timers) =>
        timers.map((timer) => ({
          ...timer,
          id: timer._id.toString(),
          start: +timer.start,
          progress: Date.now() - +timer.start,
        }))
      );

      clients.get(userId).send(JSON.stringify({ type: "active_timers", activeTimers }));
    }
  }, 1000);

  ws.on("message", async (message) => {
    let data;

    try {
      data = JSON.parse(message);
    } catch (error) {
      return;
    }

    if (data.type === "init") {
      clients.set(data.userId, ws);

      const activeTimers = await findUserTimers(db, new ObjectId(data.userId), "true").then((timers) =>
        timers.map((timer) => ({
          ...timer,
          id: timer._id.toString(),
          start: +timer.start,
          progress: Date.now() - +timer.start,
        }))
      );
      const oldTimers = await findUserTimers(db, new ObjectId(data.userId), "false").then((timers) =>
        timers.map((timer) => ({
          ...timer,
          id: timer._id.toString(),
          start: +timer.start,
          end: +timer.end,
          duration: +timer.end - +timer.start,
        }))
      );

      ws.send(JSON.stringify({ type: "all_timers", activeTimers, oldTimers }));
    }

    if (data.type === "all_timers") {
      const activeTimers = await findUserTimers(db, new ObjectId(data.userId), "true").then((timers) =>
        timers.map((timer) => ({
          ...timer,
          id: timer._id.toString(),
          start: +timer.start,
          progress: Date.now() - +timer.start,
        }))
      );
      const oldTimers = await findUserTimers(db, new ObjectId(data.userId), "false").then((timers) =>
        timers.map((timer) => ({
          ...timer,
          id: timer._id.toString(),
          start: +timer.start,
          end: +timer.end,
          duration: +timer.end - +timer.start,
        }))
      );

      ws.send(JSON.stringify({ type: "all_timers", activeTimers, oldTimers }));
    }
  });

  ws.on("close", () => {
    for (const userId of clients.keys()) {
      if (clients.get(userId) === ws) {
        clients.delete(userId);
      }
    }
  });
});

const createUser = async (db, username, password) => {
  const { insertedId } = await db.collection("users").insertOne({
    username,
    password: hash(password),
  });

  return insertedId;
};

const findUserByUsername = async (db, username) => {
  return db.collection("users").findOne({ username });
};

const findUserBySessionId = async (db, sessionId) => {
  const session = await db.collection("sessions").findOne({ sessionId }, { projection: { userId: 1 } });

  if (!session) {
    return;
  }

  return db.collection("users").findOne({ _id: new ObjectId(session.userId) });
};

const createSession = async (db, userId) => {
  const sessionId = nanoid();

  await db.collection("sessions").insertOne({
    userId,
    sessionId,
  });

  return sessionId;
};

const deleteSession = async (db, sessionId) => {
  await db.collection("sessions").deleteOne({ sessionId });
};

const createTimer = async (db, userId, desc) => {
  const { insertedId } = await db.collection("timers").insertOne(
    {
      start: Date.now(),
      end: 0,
      userId,
      description: desc,
      isActive: true,
    },
    { $set: {} },
    { upsert: true, returnDocument: "after" }
  );

  return insertedId;
};

const findUserTimers = async (db, userId, isActive) => {
  const active = isActive === "true" ? true : false;
  const timers = await db
    .collection("timers")
    .find({
      userId,
      isActive: active,
    })
    .toArray();

  return timers;
};

const switchTimerState = async (db, timerId) => {
  const { value: timer } = await db.collection("timers").findOneAndUpdate(
    { _id: new ObjectId(timerId) },
    {
      $set: {
        isActive: false,
        end: Date.now(),
      },
    },
    { upsert: true, returnDocument: "after" }
  );

  return timer;
};

app.get("/", auth(), (req, res) => {
  res.render("index", {
    user: req.user,
    authError: req.query.authError === "true" ? "Wrong username or password" : req.query.authError,
  });
});

app.post("/login", bodyParser.urlencoded({ extended: false }), async (req, res) => {
  const { username, password } = req.body;
  const user = await findUserByUsername(req.db, username);

  if (!user || !password || hash(password) !== user.password) return res.redirect("/?authError=true");

  const sessionId = await createSession(req.db, user._id);
  res.cookie("sessionId", sessionId, { httpOnly: true }).redirect("/");
});

app.get("/logout", auth(), async (req, res) => {
  if (!req.user) return res.redirect("/");
  await deleteSession(req.db, req.sessionId);
  res.clearCookie("sessionId").redirect("/");
});

app.post("/signup", bodyParser.urlencoded({ extended: false }), async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) return res.redirect("/?authError=true");

  let user = await findUserByUsername(req.db, username);

  if (user) return res.redirect("/");

  const userId = await createUser(req.db, username, password);
  const sessionId = await createSession(req.db, userId);

  res.cookie("sessionId", sessionId, { httpOnly: true }).redirect("/");
});

app.get("/api/timers", auth(), async (req, res) => {
  if (!req.user) return res.redirect("/");
  const user = await findUserByUsername(req.db, req.user.username);

  if (req.query.isActive === "true") {
    await findUserTimers(req.db, user._id, req.query.isActive)
      .then((timers) =>
        timers.map((timer) => ({
          ...timer,
          id: timer._id.toString(),
          start: +timer.start,
          progress: Date.now() - +timer.start,
        }))
      )
      .then((timers) => {
        return res.json(timers);
      });
  } else {
    await findUserTimers(req.db, user._id, req.query.isActive)
      .then((timers) =>
        timers.map((timer) => ({
          ...timer,
          id: timer._id.toString(),
          start: +timer.start,
          end: +timer.end,
          duration: +timer.end - +timer.start,
        }))
      )
      .then((timers) => {
        return res.json(timers);
      });
  }
});

app.post("/api/timers", auth(), async (req, res) => {
  if (!req.body) return res.sendStatus(401);
  const description = req.body.description;

  if (!req.user) return res.redirect("/");

  const timer = await createTimer(req.db, req.user._id, description);

  return res.json(timer.toString());
});

app.post("/api/timers/:id/stop", auth(), async (req, res) => {
  if (!req.user) return res.redirect("/");
  const timer = await switchTimerState(req.db, req.params.id);

  return res.json(timer);
});

const port = process.env.PORT || 3000;

server.listen(port, () => {
  console.log(`  Listening on http://localhost:${port}`);
});
