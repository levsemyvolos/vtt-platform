// Custom HTML dashboard for §3.14 (Artillery 2.x no longer ships local HTML reporter).
// Reads loadtest/report.json and renders a single HTML with summary stats + chart.

import fs from 'node:fs';
import path from 'node:path';

const r = JSON.parse(fs.readFileSync(path.resolve('loadtest/report.json'), 'utf8'));
const periods = r.intermediate || [];
const agg = r.aggregate;

const windows = periods
  .map((p, i) => ({
    i: i + 1,
    requests: p.counters?.['http.requests'] || 0,
    p95: p.summaries?.['http.response_time']?.p95 ?? null,
    p99: p.summaries?.['http.response_time']?.p99 ?? null,
    max: p.summaries?.['http.response_time']?.max ?? null,
  }))
  .filter((w) => w.requests > 0);

const rt = agg.summaries['http.response_time'] || {};
const counters = agg.counters || {};

const html = `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8" />
<title>VTT Platform — Load Test Report (§3.14)</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; max-width: 1100px; margin: 24px auto; padding: 0 24px; color: #222; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .subtitle { color: #666; margin-bottom: 24px; font-size: 14px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
  .card { padding: 16px 18px; background: #f6f8fa; border: 1px solid #e1e4e8; border-radius: 6px; }
  .card .v { font-size: 24px; font-weight: 600; color: #0366d6; }
  .card .l { font-size: 12px; color: #586069; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
  th, td { padding: 8px 10px; border-bottom: 1px solid #e1e4e8; text-align: right; }
  th:first-child, td:first-child { text-align: left; }
  th { background: #f6f8fa; }
  canvas { max-height: 380px; }
  h2 { font-size: 17px; margin-top: 28px; border-bottom: 1px solid #e1e4e8; padding-bottom: 6px; }
</style>
</head>
<body>
<h1>VTT Platform — Протокол навантажувального тестування (§3.14)</h1>
<div class="subtitle">Artillery 2.0 · 5 фаз 10→100 VU · localhost target · PostgreSQL 16 (Docker)</div>

<div class="grid">
  <div class="card"><div class="v">${counters['http.requests'] || 0}</div><div class="l">Загалом запитів</div></div>
  <div class="card"><div class="v">${rt.p95 ?? '—'} мс</div><div class="l">p95 час відгуку</div></div>
  <div class="card"><div class="v">${rt.p99 ?? '—'} мс</div><div class="l">p99 час відгуку</div></div>
  <div class="card"><div class="v">${rt.max ?? '—'} мс</div><div class="l">Максимум</div></div>
  <div class="card"><div class="v">${counters['http.codes.200'] || 0}</div><div class="l">HTTP 200 (успішних)</div></div>
  <div class="card"><div class="v">${counters['http.codes.401'] || 0}</div><div class="l">HTTP 401 (auth без seed)</div></div>
  <div class="card"><div class="v">${counters['http.codes.5xx'] || 0}</div><div class="l">HTTP 5xx помилок</div></div>
  <div class="card"><div class="v">${Math.round((counters['http.requests'] || 0) / ((agg.lastMetricAt - agg.firstMetricAt) / 1000))} req/s</div><div class="l">Середня швидкість</div></div>
</div>

<h2>Графік часу відгуку за десятисекундними вікнами</h2>
<canvas id="latencyChart"></canvas>

<h2>Графік пропускної здатності</h2>
<canvas id="rpsChart"></canvas>

<h2>Розподіл за фазами навантаження</h2>
<table>
  <thead>
    <tr><th>Вікно</th><th>Запитів</th><th>p95, мс</th><th>p99, мс</th><th>max, мс</th></tr>
  </thead>
  <tbody>
    ${windows
      .map(
        (w) =>
          `<tr><td>${w.i}</td><td>${w.requests}</td><td>${w.p95}</td><td>${w.p99}</td><td>${w.max}</td></tr>`,
      )
      .join('\n    ')}
  </tbody>
</table>

<h2>Зведений розподіл часу відгуку (percentiles)</h2>
<table>
  <thead><tr><th>Percentile</th><th>Значення, мс</th></tr></thead>
  <tbody>
    <tr><td>min</td><td>${rt.min}</td></tr>
    <tr><td>p50 / median</td><td>${rt.median}</td></tr>
    <tr><td>p75</td><td>${rt.p75}</td></tr>
    <tr><td>p90</td><td>${rt.p90}</td></tr>
    <tr><td>p95</td><td>${rt.p95}</td></tr>
    <tr><td>p99</td><td>${rt.p99}</td></tr>
    <tr><td>p99.9</td><td>${rt.p999}</td></tr>
    <tr><td>max</td><td>${rt.max}</td></tr>
    <tr><td>mean</td><td>${rt.mean}</td></tr>
  </tbody>
</table>

<script>
const labels = ${JSON.stringify(windows.map((w) => `Вікно ${w.i}`))};
const p95 = ${JSON.stringify(windows.map((w) => w.p95))};
const p99 = ${JSON.stringify(windows.map((w) => w.p99))};
const maxs = ${JSON.stringify(windows.map((w) => w.max))};
const reqs = ${JSON.stringify(windows.map((w) => w.requests))};

new Chart(document.getElementById('latencyChart'), {
  type: 'line',
  data: {
    labels,
    datasets: [
      { label: 'p95, мс', data: p95, borderColor: '#0366d6', backgroundColor: 'rgba(3,102,214,0.1)', fill: true, tension: 0.3 },
      { label: 'p99, мс', data: p99, borderColor: '#d73a49', backgroundColor: 'rgba(215,58,73,0.1)', fill: false, tension: 0.3 },
      { label: 'max, мс', data: maxs, borderColor: '#6f42c1', backgroundColor: 'rgba(111,66,193,0.1)', fill: false, tension: 0.3 },
    ],
  },
  options: { responsive: true, scales: { y: { title: { display: true, text: 'мс' }, beginAtZero: true } } },
});

new Chart(document.getElementById('rpsChart'), {
  type: 'bar',
  data: { labels, datasets: [{ label: 'Запитів у вікні', data: reqs, backgroundColor: 'rgba(40,167,69,0.7)' }] },
  options: { responsive: true, scales: { y: { title: { display: true, text: 'кількість запитів' }, beginAtZero: true } } },
});
</script>
</body>
</html>
`;

fs.writeFileSync(path.resolve('loadtest/report.html'), html);
console.log(`Wrote loadtest/report.html (${html.length} bytes)`);
console.log(`Open in browser: file:///${path.resolve('loadtest/report.html').replace(/\\/g, '/')}`);
