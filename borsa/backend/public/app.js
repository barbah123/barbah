// Borsa paper-trading web arayüzü
// Grafik: TradingView widget'ı; fiyat/emir/strateji verisi: /api/*

const deviceId = (() => {
  let id = localStorage.getItem('device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('device_id', id);
  }
  return id;
})();

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': deviceId,
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'İstek başarısız');
  return data;
}

// --- Biçimleyiciler ---
const fmtMoney = (v) =>
  '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = (v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 4 });
const fmtPct = (v) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`;
const cls = (v) => (v >= 0 ? 'up' : 'down');
const fmtTime = (iso) => {
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// --- Durum ---
let selectedSymbol = localStorage.getItem('selected_symbol') || 'AAPL';
let side = 'buy';
let orderType = 'market';
let lastQuotes = new Map();
let currentPositions = [];

// --- TradingView grafiği ---
function loadChart(symbol) {
  document.getElementById('tvChart').innerHTML = '';
  new TradingView.widget({
    container_id: 'tvChart',
    symbol,
    interval: '5',
    timezone: 'Europe/Istanbul',
    theme: 'dark',
    style: '1',
    locale: 'tr',
    autosize: true,
    hide_side_toolbar: false,
    allow_symbol_change: false,
  });
}

function selectSymbol(symbol) {
  selectedSymbol = symbol;
  localStorage.setItem('selected_symbol', symbol);
  document.getElementById('tradeSymbol').textContent = symbol;
  loadChart(symbol);
  updateTradeHeader();
  renderWatchlistActive();
}

// --- İzleme listesi ---
async function refreshWatchlist() {
  const { watchlist } = await api('/api/watchlist');
  const ul = document.getElementById('watchlist');
  ul.innerHTML = '';
  for (const item of watchlist) {
    if (item.quote) lastQuotes.set(item.symbol, item.quote);
    const q = item.quote;
    const li = document.createElement('li');
    li.dataset.symbol = item.symbol;
    li.innerHTML = `
      <span class="sym">${esc(item.symbol)}</span>
      <span class="quote">
        ${q ? `<div>${fmtMoney(q.price)}</div><div class="chg ${cls(q.changePercent)}">${fmtPct(q.changePercent)}</div>` : '<div class="chg">—</div>'}
      </span>
      <button class="rm" title="Listeden çıkar">✕</button>`;
    li.addEventListener('click', () => selectSymbol(item.symbol));
    li.querySelector('.rm').addEventListener('click', async (e) => {
      e.stopPropagation();
      await api(`/api/watchlist/${encodeURIComponent(item.symbol)}`, { method: 'DELETE' });
      refreshWatchlist();
    });
    ul.appendChild(li);
  }
  renderWatchlistActive();
  updateTradeHeader();
}

function renderWatchlistActive() {
  document.querySelectorAll('#watchlist li').forEach((li) => {
    li.classList.toggle('active', li.dataset.symbol === selectedSymbol);
  });
}

// --- Arama ---
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
let searchTimer;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = searchInput.value.trim();
  if (q.length < 2) {
    searchResults.classList.add('hidden');
    return;
  }
  searchTimer = setTimeout(async () => {
    try {
      const { results } = await api(`/api/search?q=${encodeURIComponent(q)}`);
      searchResults.innerHTML = results.length
        ? results
            .map(
              (r) =>
                `<div class="item" data-symbol="${esc(r.symbol)}"><b>${esc(r.symbol)}</b><span class="name">${esc(r.name)} · ${esc(r.exchange)}</span></div>`
            )
            .join('')
        : '<div class="item">Sonuç yok</div>';
      searchResults.classList.remove('hidden');
      searchResults.querySelectorAll('.item[data-symbol]').forEach((el) => {
        el.addEventListener('click', async () => {
          const symbol = el.dataset.symbol;
          searchResults.classList.add('hidden');
          searchInput.value = '';
          await api('/api/watchlist', { method: 'POST', body: JSON.stringify({ symbol }) });
          await refreshWatchlist();
          selectSymbol(symbol);
        });
      });
    } catch {
      searchResults.classList.add('hidden');
    }
  }, 300);
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-box')) searchResults.classList.add('hidden');
});

// --- İşlem paneli ---
function setupSeg(id, onChange) {
  const seg = document.getElementById(id);
  seg.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      seg.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      onChange(btn.dataset.value);
    });
  });
}
setupSeg('sideSeg', (v) => {
  side = v;
  const btn = document.getElementById('submitBtn');
  btn.textContent = v === 'buy' ? 'AL' : 'SAT';
  btn.className = `btn ${v}`;
});
setupSeg('typeSeg', (v) => {
  orderType = v;
  document.getElementById('limitInput').classList.toggle('hidden', v !== 'limit');
  updateEstCost();
});

function updateTradeHeader() {
  const q = lastQuotes.get(selectedSymbol);
  const priceEl = document.getElementById('tradePrice');
  if (q) {
    priceEl.innerHTML = `${fmtMoney(q.price)} <span class="${cls(q.changePercent)}">${fmtPct(q.changePercent)}</span>`;
  }
  const pos = currentPositions.find((p) => p.symbol === selectedSymbol);
  document.getElementById('tradePosition').textContent = pos
    ? `Pozisyon: ${fmtNum(pos.quantity)} adet @ ${fmtMoney(pos.avg_cost)}`
    : '';
  updateEstCost();
}

function updateEstCost() {
  const qty = Number(document.getElementById('qtyInput').value) || 0;
  const limit = Number(document.getElementById('limitInput').value) || 0;
  const q = lastQuotes.get(selectedSymbol);
  const unit = orderType === 'limit' ? limit : q?.price ?? 0;
  document.getElementById('estCost').textContent =
    qty > 0 && unit > 0 ? `≈ ${fmtMoney(qty * unit)}` : '';
}
document.getElementById('qtyInput').addEventListener('input', updateEstCost);
document.getElementById('limitInput').addEventListener('input', updateEstCost);

document.getElementById('tradeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('tradeMsg');
  msg.textContent = '';
  try {
    const body = {
      symbol: selectedSymbol,
      side,
      type: orderType,
      quantity: Number(document.getElementById('qtyInput').value),
    };
    if (orderType === 'limit') body.limit_price = Number(document.getElementById('limitInput').value);
    const { order } = await api('/api/orders', { method: 'POST', body: JSON.stringify(body) });
    msg.className = 'trade-msg up';
    msg.textContent =
      order.status === 'filled'
        ? `Emir gerçekleşti: ${order.side === 'buy' ? 'ALIŞ' : 'SATIŞ'} ${fmtNum(order.quantity)} ${order.symbol} @ ${fmtMoney(order.fill_price)}`
        : `Limit emri açıldı: ${fmtNum(order.quantity)} ${order.symbol} @ ${fmtMoney(order.limit_price)}`;
    refreshPortfolio();
    refreshOrders();
  } catch (err) {
    msg.className = 'trade-msg down';
    msg.textContent = err.message;
  }
});

// --- Portföy ---
async function refreshPortfolio() {
  const p = await api('/api/portfolio');
  currentPositions = p.positions;
  document.getElementById('equity').textContent = fmtMoney(p.equity);
  document.getElementById('cash').textContent = fmtMoney(p.cash);
  const pnlEl = document.getElementById('totalPnl');
  pnlEl.textContent = `${fmtMoney(p.total_pnl)} (${fmtPct(p.total_pnl_percent)})`;
  pnlEl.className = `value ${cls(p.total_pnl)}`;

  const panel = document.getElementById('tab-positions');
  panel.innerHTML = p.positions.length
    ? `<table><thead><tr>
        <th>Sembol</th><th>Adet</th><th>Ort. Maliyet</th><th>Fiyat</th><th>Değer</th><th>K/Z</th><th>K/Z %</th><th>Gün %</th>
      </tr></thead><tbody>${p.positions
        .map(
          (pos) => `<tr>
          <td><b>${esc(pos.symbol)}</b></td>
          <td>${fmtNum(pos.quantity)}</td>
          <td>${fmtMoney(pos.avg_cost)}</td>
          <td>${fmtMoney(pos.price)}</td>
          <td>${fmtMoney(pos.value)}</td>
          <td class="${cls(pos.unrealized_pnl)}">${fmtMoney(pos.unrealized_pnl)}</td>
          <td class="${cls(pos.unrealized_pnl)}">${fmtPct(pos.unrealized_pnl_percent)}</td>
          <td class="${cls(pos.day_change_percent)}">${fmtPct(pos.day_change_percent)}</td>
        </tr>`
        )
        .join('')}</tbody></table>`
    : '<div class="empty">Henüz pozisyon yok — soldan bir hisse seçip AL emri verin.</div>';
  updateTradeHeader();
}

document.getElementById('resetBtn').addEventListener('click', async () => {
  if (!confirm('Portföy sıfırlansın mı? Tüm pozisyonlar, emirler ve sinyaller silinir.')) return;
  await api('/api/portfolio/reset', { method: 'POST' });
  refreshPortfolio();
  refreshOrders();
  refreshStrategies();
});

// --- Emirler ---
const SIDE_TR = { buy: 'AL', sell: 'SAT' };
const STATUS_TR = { open: 'Açık', filled: 'Gerçekleşti', cancelled: 'İptal', rejected: 'Reddedildi' };

async function refreshOrders() {
  const { orders } = await api('/api/orders');
  const panel = document.getElementById('tab-orders');
  panel.innerHTML = orders.length
    ? `<table><thead><tr>
        <th>Zaman</th><th>Sembol</th><th>Yön</th><th>Tip</th><th>Adet</th><th>Limit</th><th>Gerçekleşme</th><th>K/Z</th><th>Durum</th><th></th>
      </tr></thead><tbody>${orders
        .map(
          (o) => `<tr>
          <td>${fmtTime(o.created_at)}</td>
          <td><b>${esc(o.symbol)}</b>${o.source === 'strategy' ? ' 🤖' : ''}</td>
          <td><span class="pill ${o.side}">${SIDE_TR[o.side]}</span></td>
          <td>${o.type === 'market' ? 'Piyasa' : 'Limit'}</td>
          <td>${fmtNum(o.quantity)}</td>
          <td>${o.limit_price != null ? fmtMoney(o.limit_price) : '—'}</td>
          <td>${o.fill_price != null ? fmtMoney(o.fill_price) : '—'}</td>
          <td class="${o.realized_pnl != null ? cls(o.realized_pnl) : ''}">${o.realized_pnl != null ? fmtMoney(o.realized_pnl) : '—'}</td>
          <td><span class="pill ${o.status}" title="${esc(o.note ?? '')}">${STATUS_TR[o.status] ?? o.status}</span></td>
          <td>${o.status === 'open' ? `<button class="btn ghost small" data-cancel="${o.id}">İptal</button>` : ''}</td>
        </tr>`
        )
        .join('')}</tbody></table>`
    : '<div class="empty">Henüz emir yok.</div>';
  panel.querySelectorAll('[data-cancel]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/api/orders/${btn.dataset.cancel}/cancel`, { method: 'POST' });
      refreshOrders();
      refreshPortfolio();
    });
  });
}

// --- Stratejiler ---
const STRATEGY_LABELS = { sma_cross: 'SMA Kesişimi', rsi: 'RSI', ftrend: 'FTREND (Trend Takibi)' };

async function refreshStrategies() {
  const { strategies } = await api('/api/strategies');
  const panel = document.getElementById('tab-strategies');
  panel.innerHTML = `
    <form class="strategy-form" id="strategyForm">
      <input id="stSymbol" placeholder="Sembol" value="${esc(selectedSymbol)}" />
      <select id="stType">
        <option value="sma_cross">SMA Kesişimi (9/21)</option>
        <option value="rsi">RSI (14, 30/70)</option>
        <option value="ftrend">FTREND (2, 3) — 1s trend takibi</option>
      </select>
      <input id="stQty" type="number" min="1" step="1" value="1" title="Sinyal başına adet" />
      <label><input id="stAuto" type="checkbox" checked /> Otomatik işle</label>
      <button type="submit" class="btn ghost small">Strateji Ekle</button>
      <button type="button" id="runBtn" class="btn ghost small">▶ Şimdi Çalıştır</button>
      <span id="stMsg"></span>
    </form>
    ${
      strategies.length
        ? `<table><thead><tr>
            <th>Sembol</th><th>Strateji</th><th>Parametreler</th><th>Adet</th><th>Oto</th><th>Durum</th><th></th>
          </tr></thead><tbody>${strategies
            .map(
              (s) => `<tr>
              <td><b>${esc(s.symbol)}</b></td>
              <td>${STRATEGY_LABELS[s.type] ?? s.type}</td>
              <td>${esc(Object.entries(s.params).map(([k, v]) => `${k}=${v}`).join(', '))}</td>
              <td>${fmtNum(s.quantity)}</td>
              <td>${s.auto_execute ? '🤖' : '—'}</td>
              <td><button class="btn ghost small" data-toggle="${s.id}" data-enabled="${s.enabled}">${s.enabled ? 'Etkin ✓' : 'Devre dışı'}</button></td>
              <td><button class="btn ghost small" data-del="${s.id}">Sil</button></td>
            </tr>`
            )
            .join('')}</tbody></table>`
        : '<div class="empty">Strateji yok. Bir sembol için SMA veya RSI stratejisi ekleyin; cron her 5 dk’da değerlendirir.</div>'
    }`;

  panel.querySelector('#strategyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = panel.querySelector('#stMsg');
    try {
      await api('/api/strategies', {
        method: 'POST',
        body: JSON.stringify({
          symbol: panel.querySelector('#stSymbol').value,
          type: panel.querySelector('#stType').value,
          quantity: Number(panel.querySelector('#stQty').value),
          auto_execute: panel.querySelector('#stAuto').checked,
        }),
      });
      refreshStrategies();
    } catch (err) {
      msg.className = 'down';
      msg.textContent = err.message;
    }
  });
  panel.querySelector('#runBtn').addEventListener('click', async () => {
    const msg = panel.querySelector('#stMsg');
    msg.className = '';
    msg.textContent = 'Çalışıyor…';
    try {
      const { summary } = await api('/api/strategies/run', { method: 'POST' });
      msg.textContent = `${summary.evaluated} strateji değerlendirildi, ${summary.signals} sinyal, ${summary.executed} emir.`;
      refreshSignals();
      refreshOrders();
      refreshPortfolio();
    } catch (err) {
      msg.className = 'down';
      msg.textContent = err.message;
    }
  });
  panel.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/api/strategies/${btn.dataset.toggle}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: btn.dataset.enabled !== '1' }),
      });
      refreshStrategies();
    });
  });
  panel.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/api/strategies/${btn.dataset.del}`, { method: 'DELETE' });
      refreshStrategies();
    });
  });
}

// --- Sinyaller ---
const SIGNAL_STATUS_TR = { new: 'Yeni', executed: 'İşlendi', skipped: 'Atlandı' };

async function refreshSignals() {
  const { signals } = await api('/api/signals');
  const panel = document.getElementById('tab-signals');
  panel.innerHTML = signals.length
    ? `<table><thead><tr>
        <th>Zaman</th><th>Sembol</th><th>Sinyal</th><th>Fiyat</th><th>Gerekçe</th><th>Durum</th>
      </tr></thead><tbody>${signals
        .map(
          (s) => `<tr>
          <td>${fmtTime(s.created_at)}</td>
          <td><b>${esc(s.symbol)}</b></td>
          <td><span class="pill ${s.action}">${SIDE_TR[s.action]}</span></td>
          <td>${fmtMoney(s.price)}</td>
          <td style="text-align:left">${esc(s.reason)}${s.note ? ` — <span class="down">${esc(s.note)}</span>` : ''}</td>
          <td><span class="pill ${s.status}">${SIGNAL_STATUS_TR[s.status] ?? s.status}</span></td>
        </tr>`
        )
        .join('')}</tbody></table>`
    : '<div class="empty">Henüz sinyal üretilmedi.</div>';
}

// --- Otonom Bot ---
const BOT_FIELDS = [
  ['risk_per_trade_pct', 'İşlem başına risk %'],
  ['stop_loss_pct', 'Stop-loss %'],
  ['take_profit_pct', 'Hedef (kâr al) %'],
  ['trailing_stop_pct', 'İz süren stop % (0=kapalı)'],
  ['max_positions', 'Azami eşzamanlı pozisyon'],
  ['max_position_pct', 'Tek pozisyon azami % (özkaynak)'],
];

async function refreshBot() {
  const { config, trades, stats } = await api('/api/bot');
  const panel = document.getElementById('tab-bot');
  panel.innerHTML = `
    <form class="strategy-form" id="botForm">
      <label><input id="botEnabled" type="checkbox" ${config.enabled ? 'checked' : ''} /> <b>Bot etkin</b></label>
      ${BOT_FIELDS.map(
        ([key, label]) =>
          `<label title="${esc(label)}">${esc(label.split(' ')[0])} <input data-field="${key}" type="number" step="0.1" min="0" value="${config[key]}" style="width:64px" /></label>`
      ).join('')}
      <label><input id="botFlatten" type="checkbox" ${config.flatten_eod ? 'checked' : ''} /> Gün sonu kapat</label>
      <button type="submit" class="btn ghost small">Kaydet</button>
      <button type="button" id="botRunBtn" class="btn ghost small">▶ Döngüyü Çalıştır</button>
      <span id="botMsg"></span>
    </form>
    <div id="botReport" class="empty" style="text-align:left; white-space:pre-wrap; display:none"></div>
    ${
      stats && stats.closedToday
        ? `<p style="color:var(--muted); margin:6px 0">Son 24s: ${stats.closedToday} işlem · kazanç oranı ${stats.winRate?.toFixed(0)}% · K/Z ${fmtMoney(stats.totalPnl)}${stats.profitFactor != null ? ` · kâr faktörü ${stats.profitFactor.toFixed(2)}` : ''}</p>`
        : ''
    }
    ${
      trades.length
        ? `<table><thead><tr>
            <th>Açılış</th><th>Sembol</th><th>Adet</th><th>Giriş</th><th>Stop</th><th>Hedef</th><th>Çıkış</th><th>K/Z</th><th>Durum</th>
          </tr></thead><tbody>${trades
            .map(
              (t) => `<tr>
              <td>${fmtTime(t.opened_at)}</td>
              <td><b>${esc(t.symbol)}</b></td>
              <td>${fmtNum(t.quantity)}</td>
              <td title="${esc(t.entry_reason ?? '')}">${fmtMoney(t.entry_price)}</td>
              <td>${fmtMoney(t.stop_loss)}</td>
              <td>${fmtMoney(t.take_profit)}</td>
              <td title="${esc(t.exit_reason ?? '')}">${t.exit_price != null ? fmtMoney(t.exit_price) : '—'}</td>
              <td class="${t.pnl != null ? cls(t.pnl) : ''}">${t.pnl != null ? fmtMoney(t.pnl) : '—'}</td>
              <td><span class="pill ${t.status === 'open' ? 'open' : 'filled'}">${t.status === 'open' ? 'Açık' : 'Kapalı'}</span></td>
            </tr>`
            )
            .join('')}</tbody></table>`
        : '<div class="empty">Bot henüz işlem yapmadı. Etkinleştirin — her 10 dakikada analiz + risk yönetimi yapar ve Telegram\'a rapor gönderir.</div>'
    }`;

  panel.querySelector('#botForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      enabled: panel.querySelector('#botEnabled').checked,
      flatten_eod: panel.querySelector('#botFlatten').checked,
    };
    panel.querySelectorAll('[data-field]').forEach((input) => {
      body[input.dataset.field] = Number(input.value);
    });
    const msg = panel.querySelector('#botMsg');
    try {
      await api('/api/bot', { method: 'PATCH', body: JSON.stringify(body) });
      msg.className = 'up';
      msg.textContent = 'Kaydedildi';
    } catch (err) {
      msg.className = 'down';
      msg.textContent = err.message;
    }
  });

  panel.querySelector('#botRunBtn').addEventListener('click', async () => {
    const msg = panel.querySelector('#botMsg');
    msg.className = '';
    msg.textContent = 'Döngü çalışıyor…';
    try {
      const result = await api('/api/bot/run', { method: 'POST' });
      msg.textContent = result.ran
        ? `Tamamlandı (${result.actions.length} işlem)`
        : result.skippedReason;
      const reportEl = panel.querySelector('#botReport');
      if (result.report) {
        reportEl.style.display = 'block';
        reportEl.innerHTML = result.report; // sunucu üretimi güvenli HTML (Telegram formatı)
      }
      refreshPortfolio();
      refreshOrders();
    } catch (err) {
      msg.className = 'down';
      msg.textContent = err.message;
    }
  });
}

// --- Sekmeler ---
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
    document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden');
    if (tab.dataset.tab === 'orders') refreshOrders();
    if (tab.dataset.tab === 'signals') refreshSignals();
    if (tab.dataset.tab === 'strategies') refreshStrategies();
    if (tab.dataset.tab === 'bot') refreshBot();
  });
});

// --- Başlat + periyodik yenileme ---
async function init() {
  loadChart(selectedSymbol);
  document.getElementById('tradeSymbol').textContent = selectedSymbol;
  await Promise.all([refreshWatchlist(), refreshPortfolio()]);
  refreshOrders();

  setInterval(() => {
    refreshWatchlist().catch(() => {});
    refreshPortfolio().catch(() => {});
  }, 5000);
  setInterval(() => {
    refreshOrders().catch(() => {});
  }, 15000);
}
init().catch((e) => {
  document.getElementById('tab-positions').innerHTML = `<div class="empty">Bağlantı hatası: ${esc(e.message)}</div>`;
});
