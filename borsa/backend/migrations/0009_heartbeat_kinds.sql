-- Kalp atışı tablosu iş türü bazına genişletilir (1=5dk, 2=trader, 3=tarama).
DROP TABLE cron_heartbeat;
CREATE TABLE cron_heartbeat (
  id INTEGER PRIMARY KEY,
  cron TEXT,
  at TEXT NOT NULL
);
