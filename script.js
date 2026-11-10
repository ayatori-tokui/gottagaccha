'use strict';

const STATE_KEY = 'kuji_state_v1';
const HIST_KEY = 'kuji_history_v1';
const DEFAULT_STATE = { price: 800, total: '', lastOne: 0, blank: 0, n: 10, prizes: [{ name: '', value: '', count: '' }] };

const $ = (id) => document.getElementById(id);
const yen = (v) => (v < 0 ? '-' : '') + '¥' + Math.round(Math.abs(v)).toLocaleString();
const signedYen = (v) => (v > 0 ? '+' : v < 0 ? '-' : '') + '¥' + Math.round(Math.abs(v)).toLocaleString();
const num = (v) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? Math.floor(x) : 0; };
const plClass = (v) => (v > 0 ? 'text-rose-500' : v < 0 ? 'text-sky-600' : 'text-slate-700');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let state = loadJSON(STATE_KEY, null) || structuredCloneSafe(DEFAULT_STATE);
let history = loadJSON(HIST_KEY, []);
if (!Array.isArray(history)) history = [];
if (!state.prizes || !state.prizes.length) state.prizes = [{ name: '', value: '', count: '' }];

function structuredCloneSafe(o) { return JSON.parse(JSON.stringify(o)); }
function loadJSON(k, fb) { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : fb; } catch { return fb; } }
function saveState() { try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch {} }
function saveHist() { try { localStorage.setItem(HIST_KEY, JSON.stringify(history)); } catch {} }

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 2200);
}

/* ---------- 計算ロジック ---------- */
/** N本中、対象K本(当たり)をn回引いて1本も当たらない確率（超幾何分布、ループ積） */
function missProb(N, K, n) {
  if (n > N) n = N;
  if (K <= 0) return 1;
  if (n > N - K) return 0;
  let p = 1;
  for (let i = 0; i < n; i++) p *= (N - K - i) / (N - i);
  return p;
}
const atLeastOne = (N, K, n) => 1 - missProb(N, K, n);
const pct = (p) => (p * 100).toFixed(2) + '%';

function calc() {
  const price = num(state.price), N = num(state.total), last = num(state.lastOne), n = num(state.n);
  const prizes = state.prizes.map((p) => ({ name: p.name || '(名称なし)', value: num(p.value), count: num(p.count) }));
  const sumCount = prizes.reduce((a, p) => a + p.count, 0);
  const prizeValue = prizes.reduce((a, p) => a + p.value * p.count, 0);
  const blank = num(state.blank);
  const blankCount = Math.max(0, N - sumCount); // 当たり枠に登録されていない残り=外れくじ
  const sumValue = prizeValue + blank * blankCount;
  const warns = [];
  if (sumCount > N) warns.push('当たり枠の合計本数が残り総本数を超えています。');
  const effN = Math.min(n, N);
  if (n > N && N > 0) warns.push(`残り本数(${N})を超える回数は ${N} 回として計算しています。`);

  const ev = N > 0 ? sumValue / N : 0;
  const rate = price > 0 ? (ev / price) * 100 : 0;
  const cost = price * effN;
  const any = N > 0 && sumCount <= N ? atLeastOne(N, sumCount, effN) : 0;
  const each = prizes.map((p) => ({ name: p.name, count: p.count, prob: N > 0 && p.count <= N ? atLeastOne(N, p.count, effN) : 0 }));
  const allCost = price * N;
  const allPl = sumValue + last - allCost;
  return { blankCount, ev, rate, cost, plExp: ev * effN - cost, any, each, allCost, allPl, warns, hasN: N > 0 };
}

function render() {
  const r = calc();
  $('r-ev').textContent = r.hasN ? yen(r.ev) : '-';
  $('r-rate').textContent = r.hasN ? r.rate.toFixed(1) + '%' : '-';
  $('r-cost').textContent = yen(r.cost);
  $('r-pl').textContent = r.hasN ? signedYen(r.plExp) : '-';
  $('r-pl').className = 'text-xl font-bold ' + (r.hasN ? plClass(r.plExp) : '');
  $('r-any').textContent = r.hasN ? pct(r.any) : '-';
  $('r-each').innerHTML = r.each.map((e) =>
    `<li class="flex justify-between py-2"><span>${esc(e.name)} <span class="text-xs text-slate-400">(残${e.count})</span></span><span class="font-bold">${pct(e.prob)}</span></li>`).join('');
  $('r-allcost').textContent = yen(r.allCost);
  $('r-allpl').textContent = r.hasN ? signedYen(r.allPl) : '-';
  $('r-allpl').className = 'font-bold ' + (r.hasN ? plClass(r.allPl) : '');
  const w = $('warn'); w.classList.toggle('hidden', !r.warns.length); w.innerHTML = r.warns.map(esc).join('<br>');
}

/* ---------- 入力UI ---------- */
function renderPrizes() {
  $('prizes').innerHTML = state.prizes.map((p, i) => `
    <div class="border border-slate-200 rounded-xl p-3 space-y-2" data-i="${i}">
      <div class="flex gap-2">
        <input class="inp" data-f="name" type="text" placeholder="名前 (A賞など)" value="${esc(p.name)}">
        <button class="del btn bg-red-100 text-red-700 shrink-0" aria-label="削除">✕</button>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <input class="inp" data-f="value" type="number" pattern="\\d*" inputmode="numeric" min="0" placeholder="価値(円)" value="${esc(p.value)}">
        <input class="inp" data-f="count" type="number" pattern="\\d*" inputmode="numeric" min="0" placeholder="残り本数" value="${esc(p.count)}">
      </div>
    </div>`).join('');
}

function syncInputs() {
  $('price').value = state.price; $('total').value = state.total;
  $('lastOne').value = state.lastOne; $('blank').value = state.blank ?? 0; $('n').value = state.n;
}

function bindInputs() {
  [['price', 'price'], ['total', 'total'], ['lastOne', 'lastOne'], ['blank', 'blank'], ['n', 'n']].forEach(([id, key]) =>
    $(id).addEventListener('input', (e) => { state[key] = e.target.value; saveState(); render(); }));
  $('prizes').addEventListener('input', (e) => {
    const row = e.target.closest('[data-i]'); if (!row || !e.target.dataset.f) return;
    state.prizes[+row.dataset.i][e.target.dataset.f] = e.target.value; saveState(); render();
  });
  $('prizes').addEventListener('click', (e) => {
    if (!e.target.closest('.del')) return;
    const i = +e.target.closest('[data-i]').dataset.i;
    state.prizes.splice(i, 1);
    if (!state.prizes.length) state.prizes.push({ name: '', value: '', count: '' });
    saveState(); renderPrizes(); render();
  });
  $('addPrize').addEventListener('click', () => {
    state.prizes.push({ name: '', value: '', count: '' }); saveState(); renderPrizes(); render();
    const inputs = $('prizes').querySelectorAll('[data-f="name"]');
    const last = inputs[inputs.length - 1]; last.focus(); last.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
  // 本数欄でEnter(改行/次へ)を押すと次の当たり枠を追加
  $('prizes').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset.f === 'count' && e.target.closest('[data-i]').dataset.i == state.prizes.length - 1) { e.preventDefault(); $('addPrize').click(); }
  });
  $('resetAll').addEventListener('click', () => {
    if (!confirm('入力内容をすべてリセットしますか？（履歴は消えません）')) return;
    state = structuredCloneSafe(DEFAULT_STATE); saveState(); syncInputs(); renderPrizes(); render();
  });
}

/* ---------- タブ ---------- */
function showTab(name) {
  ['sim', 'hist'].forEach((t) => $('tab-' + t).classList.toggle('hidden', t !== name));
  document.querySelectorAll('.tab').forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle('border-teal-600', on); b.classList.toggle('text-teal-700', on);
    b.classList.toggle('border-transparent', !on); b.classList.toggle('text-teal-600', !on);
  });
  window.scrollTo(0, 0);
}

/* ---------- 履歴 ---------- */
const fmtDate = (iso) => { const d = new Date(iso); return isNaN(d) ? iso : `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

function renderHistory() {
  const total = history.reduce((a, h) => a + h.profit, 0);
  const wins = history.filter((h) => h.profit > 0).length;
  $('h-summary').innerHTML = history.length
    ? `${history.length}件 / ${wins}勝 ${history.filter((h) => h.profit < 0).length}敗 / 通算 <b class="${plClass(total)}">${signedYen(total)}</b>`
    : '履歴はまだありません';
  const sorted = history.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  $('h-list').innerHTML = sorted.map((h) => `
    <li class="py-3 flex items-center justify-between gap-2">
      <div class="text-sm">
        <div class="text-xs text-slate-400">${esc(fmtDate(h.date))}${h.count ? ` ・${h.count}回` : ''}</div>
        <div>使用 ${yen(h.cost)} / 獲得 ${yen(h.value)}</div>
        ${h.cond ? `<details class="text-xs text-slate-400"><summary>記録時の条件</summary><div class="break-all">${esc(condText(h.cond))}<br>期待値 ¥${h.cond.ev} / 還元率 ${h.cond.rate}%</div></details>` : ''}
        ${h.memo ? `<div class="text-xs text-slate-500 break-all">📝 ${esc(h.memo)}</div>` : ''}
      </div>
      <div class="flex items-center gap-2">
        <span class="text-lg font-bold ${plClass(h.profit)}">${signedYen(h.profit)}</span>
        <button class="hedit text-slate-400 w-10 h-10" data-id="${esc(h.id)}" aria-label="編集">✏️</button>
        <button class="hdel text-slate-400 w-10 h-10" data-id="${esc(h.id)}" aria-label="削除">🗑</button>
      </div>
    </li>`).join('');
}

/** 記録時点のシミュレーション条件のスナップショット */
function snapshotCond() {
  const r = calc();
  return {
    price: num(state.price), total: num(state.total), lastOne: num(state.lastOne), blank: num(state.blank), n: num(state.n),
    prizes: state.prizes.map((p) => ({ name: p.name || '', value: num(p.value), count: num(p.count) })),
    ev: Math.round(r.ev * 100) / 100, rate: Math.round(r.rate * 100) / 100,
  };
}
const condText = (c) => c ? `1回¥${c.price} / 残${c.total}本 / 外れ¥${c.blank || 0} / ラスト¥${c.lastOne} / ` + (c.prizes || []).map((p) => `${p.name || '?'}:¥${p.value}×${p.count}`).join(', ') : '';

function updatePreview() {
  $('h-preview').textContent = yen(num($('h-count').value) * num(state.price));
}

function bindHistory() {
  $('h-count').addEventListener('input', updatePreview);
  $('record').addEventListener('click', () => {
    const count = num($('h-count').value);
    if (!count) { toast('引いた回数を入力してください'); return; }
    if (!num(state.price)) { toast('シミュレーション画面で1回あたりの金額を入力してください'); return; }
    const value = num($('h-value').value), cost = count * num(state.price);
    history.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date: new Date().toISOString(), count, cost, value, profit: value - cost, memo: $('h-memo').value.trim(), cond: snapshotCond() });
    saveHist(); renderHistory();
    $('h-count').value = ''; $('h-value').value = ''; $('h-memo').value = ''; updatePreview(); toast('記録しました');
  });
  $('h-list').addEventListener('click', (e) => {
    const eb = e.target.closest('.hedit'); if (eb) { openEdit(eb.dataset.id); return; }
    const b = e.target.closest('.hdel'); if (!b || !confirm('この履歴を削除しますか？')) return;
    history = history.filter((h) => h.id !== b.dataset.id); saveHist(); renderHistory();
  });
  $('clearHist').addEventListener('click', () => {
    if (!history.length || !confirm('履歴をすべて削除します。よろしいですか？')) return;
    history = []; saveHist(); renderHistory();
  });
}

/* ---------- 履歴の編集 ---------- */
let editingId = null;
function openEdit(id) {
  const h = history.find((x) => x.id === id); if (!h) return;
  editingId = id;
  $('e-count').value = h.count || 0; $('e-cost').value = h.cost; $('e-value').value = h.value; $('e-memo').value = h.memo || '';
  $('editModal').classList.remove('hidden'); $('editModal').classList.add('flex');
}
function closeEdit() { editingId = null; $('editModal').classList.add('hidden'); $('editModal').classList.remove('flex'); }
function bindEdit() {
  $('e-cancel').addEventListener('click', closeEdit);
  $('editModal').addEventListener('click', (e) => { if (e.target === $('editModal')) closeEdit(); });
  $('e-save').addEventListener('click', () => {
    const h = history.find((x) => x.id === editingId); if (!h) return closeEdit();
    h.count = num($('e-count').value); h.cost = num($('e-cost').value); h.value = num($('e-value').value);
    h.profit = h.value - h.cost; h.memo = $('e-memo').value.trim();
    saveHist(); renderHistory(); closeEdit(); toast('更新しました');
  });
}

/* ---------- ファイル入出力 ---------- */
function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const stamp = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };

function exportJson() {
  if (!history.length) { toast('履歴がありません'); return; }
  download('kuji_history.json', JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), history }, null, 2), 'application/json');
}

function exportCsv() {
  if (!history.length) { toast('履歴がありません'); return; }
  const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
  const rows = [['日時', '回数', '使った金額', '得た価値', '損益金額', 'メモ', '1回の金額', '残り本数', '外れ価値', 'ラストワン価値', '期待値(1回)', '還元率(%)', '当たり枠'].map(q).join(',')];
  history.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((h) =>
    rows.push([q(fmtDate(h.date)), h.count || 0, h.cost, h.value, h.profit, q(h.memo || ''), ...(h.cond ? [h.cond.price, h.cond.total, h.cond.blank || 0, h.cond.lastOne, h.cond.ev, h.cond.rate, q((h.cond.prizes || []).map((p) => `${p.name}:${p.value}x${p.count}`).join(' / '))] : ['', '', '', '', '', '', ''])].join(',')));
  download(`kuji_history_${stamp()}.csv`, '\uFEFF' + rows.join('\r\n'), 'text/csv;charset=utf-8');
}

function cleanCond(c) {
  if (!c || typeof c !== 'object') return undefined;
  return {
    price: num(c.price), total: num(c.total), lastOne: num(c.lastOne), blank: num(c.blank), n: num(c.n),
    prizes: Array.isArray(c.prizes) ? c.prizes.map((p) => ({ name: String((p && p.name) || ''), value: num(p && p.value), count: num(p && p.count) })) : [],
    ev: Number(c.ev) || 0, rate: Number(c.rate) || 0,
  };
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const list = Array.isArray(data) ? data : data.history;
      if (!Array.isArray(list)) throw new Error('format');
      const clean = list.filter((h) => h && h.date).map((h) => {
        const cost = Number(h.cost) || 0, value = Number(h.value) || 0;
        return { id: String(h.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6)), date: String(h.date), count: Number(h.count) || 0, cost, value, profit: value - cost, memo: String(h.memo || '').slice(0, 100), cond: cleanCond(h.cond) };
      });
      const mode = document.querySelector('input[name="imode"]:checked').value;
      if (mode === 'overwrite') history = clean;
      else {
        const ids = new Set(history.map((h) => h.id));
        history = history.concat(clean.filter((h) => !ids.has(h.id)));
      }
      saveHist(); renderHistory(); toast(`${clean.length}件を読み込みました`);
    } catch { toast('読み込みに失敗しました。JSON形式を確認してください'); }
    $('importFile').value = '';
  };
  reader.readAsText(file);
}

function bindFiles() {
  $('exportJson').addEventListener('click', exportJson);
  $('exportCsv').addEventListener('click', exportCsv);
  $('importFile').addEventListener('change', (e) => { if (e.target.files[0]) importJson(e.target.files[0]); });
}

/* ---------- 初期化 ---------- */
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
bindInputs(); bindHistory(); bindEdit(); bindFiles();
syncInputs(); renderPrizes(); render(); renderHistory(); updatePreview(); showTab('sim');


/* ---------- PWA (Service Worker) ---------- */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
