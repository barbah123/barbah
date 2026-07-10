-- Cron kalp atışı: her zamanlanmış çalışma damgalanır; /api/health'ten izlenir.
-- (10 Tem: cron'lar sessizce durdu, saatler sonra fark edildi.)
CREATE TABLE cron_heartbeat (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  cron TEXT,
  at TEXT NOT NULL
);
