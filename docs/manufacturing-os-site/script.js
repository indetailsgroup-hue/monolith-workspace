
const CHAPTERS_META = [{"num": 1, "title": "บทสรุปสำหรับผู้บริหาร", "group": "foundation"}, {"num": 2, "title": "ภาพรวมของระบบ", "group": "foundation"}, {"num": 3, "title": "งานวิจัยและฐานทางวิชาการ", "group": "foundation"}, {"num": 4, "title": "สถาปัตยกรรมทางเทคนิค", "group": "foundation"}, {"num": 5, "title": "ข้อกำหนดผลิตภัณฑ์ (PRD)", "group": "foundation"}, {"num": 6, "title": "ข้อกำหนดทางเทคนิค (Technical Specification)", "group": "foundation"}, {"num": 7, "title": "เอกสารสำหรับนักพัฒนา (Developer Documentation)", "group": "foundation"}, {"num": 8, "title": "Rebuild Blueprint", "group": "foundation"}, {"num": 9, "title": "การจัดการความเสี่ยงและความท้าทาย", "group": "foundation"}, {"num": 10, "title": "แผนงานและ Roadmap", "group": "foundation"}, {"num": 11, "title": "บทสรุปและข้อเสนอแนะ", "group": "foundation"}, {"num": 12, "title": "API Reference — MCP Server & REST Endpoints", "group": "foundation"}, {"num": 13, "title": "ระบบจัดการช่างติดตั้ง (Installation Module)", "group": "domain"}, {"num": 14, "title": "การสื่อสารระหว่างแผนก (Inter-Department Communication)", "group": "domain"}, {"num": 15, "title": "ระบบควบคุมคุณภาพ (Quality Control)", "group": "domain"}, {"num": 16, "title": "ระบบจัดการคลังวัสดุ (Inventory Management)", "group": "domain"}, {"num": 17, "title": "ระบบโลจิสติกส์และจัดส่ง (Logistics & Delivery)", "group": "domain"}, {"num": 18, "title": "ระบบจัดการลูกค้า (CRM)", "group": "domain"}, {"num": 19, "title": "ระบบวางแผนการผลิต (Production Planning)", "group": "domain"}, {"num": 20, "title": "ระบบจัดการทีมและบุคลากร (HR & Team Management)", "group": "domain"}, {"num": 21, "title": "ระบบ Business Intelligence และ Dashboard", "group": "domain"}, {"num": 22, "title": "ระบบ After-Sales และการรับประกัน (After-Sales & Warranty)", "group": "domain"}, {"num": 23, "title": "ระบบจัดซื้อจัดจ้าง (Procurement)", "group": "domain"}, {"num": 24, "title": "ระบบความปลอดภัยและมาตรฐาน (Safety & Compliance)", "group": "domain"}, {"num": 25, "title": "ระบบฝึกอบรม (Training & Onboarding)", "group": "domain"}, {"num": 26, "title": "MCP Governance Stack", "group": "mcp"}, {"num": 27, "title": "Governance Middleware & Pipeline", "group": "mcp"}, {"num": 28, "title": "AI Module MCP Tools (Phase 1)", "group": "phase1"}, {"num": 29, "title": "Phase 2 Tools — Factory, CNC, Workflow", "group": "phase1"}, {"num": 30, "title": "Phase 3 Tools — Digital Shadow, Customer Portal, Analytics", "group": "phase1"}, {"num": 31, "title": "Test Suite & Quality Assurance", "group": "phase1"}, {"num": 32, "title": "Phase 4 — Notification, Reporting & Backup Management", "group": "phase1"}, {"num": 33, "title": "Phase 5 — Organization, Culture & CI/CD Hardening", "group": "phase1"}, {"num": 34, "title": "Architecture Decision Records (ADR)", "group": "phase2"}, {"num": 35, "title": "Phase 6 — Analytics Dashboard & Real-time Monitoring", "group": "phase2"}, {"num": 36, "title": "Load Testing Strategy & Performance Benchmarks", "group": "phase2"}, {"num": 37, "title": "Phase 7: Supply Chain Management & Vendor Portal", "group": "phase2"}, {"num": 38, "title": "Persona User Journey Mapping", "group": "phase2"}, {"num": 39, "title": "Financial Management & Invoicing (Phase 8)", "group": "phase2"}, {"num": 40, "title": "Performance Benchmark Report (Phase 8)", "group": "phase2"}, {"num": 41, "title": "HR Management Module (Phase 9)", "group": "phase3"}, {"num": 42, "title": "Employee Self-Service Module (Phase 9)", "group": "phase3"}, {"num": 43, "title": "Phase 9 Load Test Results", "group": "phase3"}, {"num": 44, "title": "Document Management Module (Phase 10)", "group": "phase3"}, {"num": 45, "title": "E-Signature Module (Phase 10)", "group": "phase3"}, {"num": 46, "title": "Compliance & Audit Trail Module (Phase 11)", "group": "phase3"}, {"num": 47, "title": "Regulatory Reporting Module (Phase 11)", "group": "phase3"}, {"num": 48, "title": "CRM Management Module (Phase 12)", "group": "phase3"}, {"num": 49, "title": "Customer Feedback & Analytics Module (Phase 12)", "group": "phase3"}, {"num": 50, "title": "Data Warehouse Integration Module (Phase 13)", "group": "phase3"}, {"num": 51, "title": "BI Dashboard & Reporting Module (Phase 13)", "group": "phase3"}, {"num": 52, "title": "IoT Sensor Data Management Module (Phase 14)", "group": "phase3"}, {"num": 53, "title": "Edge Device & Real-Time Alerting Module (Phase 14)", "group": "phase3"}, {"num": 54, "title": "Phase 15 — Predictive Maintenance System", "group": "phase3"}, {"num": 55, "title": "Phase 15 — Deployment, Governance, and Persona Use Cases", "group": "phase3"}];

let chaptersData = null;
let currentChapter = 1;

async function loadChaptersData() {
  if (chaptersData) return chaptersData;
  const res = await fetch('chapters.json');
  chaptersData = await res.json();
  return chaptersData;
}

// ─── Analytics Tracking ────────────────────────────────────
function trackChapterView(num) {
  try {
    const key = 'monolith-views';
    const data = JSON.parse(localStorage.getItem(key) || '{}');
    data[num] = (data[num] || 0) + 1;
    localStorage.setItem(key, JSON.stringify(data));
    // Track last visited
    const hist = JSON.parse(localStorage.getItem('monolith-history') || '[]');
    hist.unshift({ num: num, ts: Date.now() });
    localStorage.setItem('monolith-history', JSON.stringify(hist.slice(0, 50)));
  } catch(e) {}
}

async function showChapter(num, pushState = true) {
  currentChapter = num;
  // Track view
  trackChapterView(num);
  // Update sidebar
  document.querySelectorAll('.chapter-link').forEach(a => {
    a.classList.toggle('active', parseInt(a.dataset.chapter) === num);
  });
  // Scroll sidebar to active
  const activeLink = document.querySelector('.chapter-link.active');
  if (activeLink) activeLink.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  // Show loading
  const container = document.getElementById('chapter-container');
  document.getElementById('loading').style.display = 'block';
  container.style.opacity = '0.3';
  // Load data
  const data = await loadChaptersData();
  const html = data[String(num)] || '<p>ไม่พบเนื้อหา</p>';
  // Build chapter toolbar (breadcrumb + PDF export button)
  const meta = CHAPTERS_META.find(c => c.num === num);
  const chTitle = meta ? meta.title : 'Chapter ' + num;
  const pdfToolbar = `<div class="chapter-toolbar no-print">
    <span class="chapter-breadcrumb">⚡ Monolith OS &nbsp;/&nbsp; <b>Ch ${num}: ${chTitle}</b></span>
    <button class="pdf-btn" onclick="printChapter(${num})" title="Export หน้านี้เป็น PDF">🖨️ Export PDF</button>
  </div>`;
  // Render
  container.innerHTML = pdfToolbar + html + buildNavLinks(num);
  container.style.opacity = '1';
  document.getElementById('loading').style.display = 'none';
  // Syntax highlighting
  if (window.hljs) {
    document.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
  }
  // Update URL
  if (pushState) history.pushState({ chapter: num }, '', '#ch' + num);
  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
  // Update title
  if (meta) document.title = 'Ch ' + num + ': ' + meta.title + ' — Monolith Manufacturing OS';
}

function buildNavLinks(num) {
  let html = '<div class="chapter-nav">';
  if (num > 1) {
    const prev = CHAPTERS_META.find(c => c.num === num - 1);
    if (prev) html += `<a href="#" onclick="showChapter(${prev.num}); return false;"><span>← บทก่อนหน้า</span>Ch ${prev.num}: ${prev.title.substring(0, 50)}${prev.title.length > 50 ? '...' : ''}</a>`;
  }
  if (num < 55) {
    const next = CHAPTERS_META.find(c => c.num === num + 1);
    if (next) html += `<a href="#" class="next" onclick="showChapter(${next.num}); return false;"><span>บทถัดไป →</span>Ch ${next.num}: ${next.title.substring(0, 50)}${next.title.length > 50 ? '...' : ''}</a>`;
  }
  html += '</div>';
  return html;
}

function filterChapters(query) {
  const q = query.toLowerCase().trim();
  document.querySelectorAll('.chapter-link').forEach(a => {
    const title = a.querySelector('.ch-title').textContent.toLowerCase();
    const num = a.querySelector('.ch-num').textContent.toLowerCase();
    a.style.display = (!q || title.includes(q) || num.includes(q)) ? 'flex' : 'none';
  });
  document.querySelectorAll('.chapter-group').forEach(g => {
    const visible = [...g.querySelectorAll('.chapter-link')].some(a => a.style.display !== 'none');
    g.style.display = visible ? 'block' : 'none';
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  patchDOM();
  initTheme();
  const hash = window.location.hash;
  const chNum = hash.startsWith('#ch') ? parseInt(hash.slice(3)) : 1;
  await showChapter(isNaN(chNum) ? 1 : chNum, false);
});

window.addEventListener('popstate', e => {
  if (e.state && e.state.chapter) showChapter(e.state.chapter, false);
});

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function printChapter(num) {
  const meta = CHAPTERS_META.find(c => c.num === num);
  const title = meta ? `Ch ${num}: ${meta.title}` : 'Chapter ' + num;
  const origTitle = document.title;
  document.title = title + ' — Monolith Manufacturing OS';
  window.print();
  document.title = origTitle;
}

// ─── Theme Toggle ──────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('monolith-theme');
  if (saved === 'light') {
    document.documentElement.classList.add('light');
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = '☀️';
  }
}

function toggleTheme() {
  const isLight = document.documentElement.classList.toggle('light');
  localStorage.setItem('monolith-theme', isLight ? 'light' : 'dark');
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = isLight ? '☀️' : '🌙';
}

// ─── Full-text Search ──────────────────────────────────────
let searchIndex = null;
let searchDebounceTimer = null;

async function loadSearchIndex() {
  if (searchIndex) return searchIndex;
  const res = await fetch('search_index.json');
  searchIndex = await res.json();
  return searchIndex;
}

function openSearch() {
  document.getElementById('search-overlay').classList.add('active');
  setTimeout(() => document.getElementById('search-input').focus(), 60);
  loadSearchIndex();
}

function closeSearch() {
  document.getElementById('search-overlay').classList.remove('active');
  document.getElementById('search-input').value = '';
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('search-count').textContent = '';
}

function getSnippet(text, query, len) {
  len = len || 200;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return text.substring(0, len) + '…';
  const start = Math.max(0, idx - 70);
  const end = Math.min(text.length, idx + query.length + 130);
  const snippet = (start > 0 ? '…' : '') + text.substring(start, end) + (end < text.length ? '…' : '');
  const re = new RegExp('(' + query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
  return snippet.replace(re, '<mark>$1</mark>');
}

async function performSearch(query) {
  const q = query.trim();
  if (q.length < 2) {
    document.getElementById('search-results').innerHTML = '';
    document.getElementById('search-count').textContent = '';
    return;
  }
  const data = await loadSearchIndex();
  const lower = q.toLowerCase();
  const matches = [];
  for (const ch of data) {
    if (ch.text.toLowerCase().includes(lower)) {
      matches.push(ch);
      if (matches.length >= 20) break;
    }
  }
  const count = matches.length;
  document.getElementById('search-count').textContent = count > 0
    ? 'พบ ' + count + ' chapters' + (count >= 20 ? ' (แสดง 20 อันดับแรก)' : '')
    : '';

  if (count === 0) {
    document.getElementById('search-results').innerHTML =
      '<div class="search-no-results">ไม่พบผลลัพธ์สำหรับ "' + q + '"</div>';
    return;
  }

  let html = '';
  for (const ch of matches) {
    const m = CHAPTERS_META.find(function(x) { return x.num === ch.num; });
    const title = m ? m.title : 'Chapter ' + ch.num;
    const snippet = getSnippet(ch.text, q);
    html += '<div class="search-result-item" onclick="showChapter(' + ch.num + '); closeSearch();">' +
      '<div class="sri-header"><span class="sri-num">Ch ' + ch.num + '</span>' +
      '<span class="sri-title">' + title + '</span></div>' +
      '<div class="sri-snippet">' + snippet + '</div></div>';
  }
  document.getElementById('search-results').innerHTML = html;
}

function debouncedSearch(value) {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(function() { performSearch(value); }, 250);
}

document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    openSearch();
  }
  if (e.key === 'Escape') {
    closeSearch();
  }
});

// ─── DOM Injection (workaround for CDN-cached index.html) ──
const _CMAP_HTML = `<div class="home-section" id="chapter-map-section">
  <h2>📊 Chapter Map — All 15 Phases</h2>
  <p>ตารางสรุปครอบคลุม 55 Chapters, MCP Tools (สะสม) และ Dependencies ระหว่าง Phase</p>
  <div class="cmap-wrap">
    <table class="cmap-table">
      <thead><tr><th>Phase</th><th>Chapters</th><th>MCP (ใหม่)</th><th>MCP (สะสม)</th><th>Status</th><th>Dependencies</th></tr></thead>
      <tbody>
        <tr class="row-foundation"><td><b>Foundation</b></td><td>Ch 1–12, 26–27</td><td>+21</td><td>21</td><td><span class="badge-done">✅ สมบูรณ์</span></td><td>—</td></tr>
        <tr><td><b>Phase 1</b></td><td>Ch 28</td><td>+9</td><td>30</td><td><span class="badge-done">✅ สมบูรณ์</span></td><td>Foundation</td></tr>
        <tr><td><b>Phase 2</b></td><td>Ch 29</td><td>+9</td><td>39</td><td><span class="badge-done">✅ สมบูรณ์</span></td><td>Phase 1</td></tr>
        <tr><td><b>Phase 3</b></td><td>Ch 30–31</td><td>+9</td><td>48</td><td><span class="badge-done">✅ สมบูรณ์</span></td><td>Phase 2</td></tr>
        <tr><td><b>Phase 4</b></td><td>Ch 32</td><td>+9</td><td>57</td><td><span class="badge-done">✅ สมบูรณ์</span></td><td>Phase 3</td></tr>
        <tr><td><b>Phase 5</b></td><td>Ch 33–34</td><td>+9</td><td>66</td><td><span class="badge-done">✅ สมบูรณ์</span></td><td>Phase 4</td></tr>
        <tr><td><b>Phase 6</b></td><td>Ch 35–36</td><td>+6</td><td>72</td><td><span class="badge-done">✅ สมบูรณ์</span></td><td>Phase 5</td></tr>
        <tr><td><b>Phase 7</b></td><td>Ch 37–38</td><td>+6</td><td>78</td><td><span class="badge-done">✅ สมบูรณ์</span></td><td>Phase 5 + Phase 6</td></tr>
        <tr><td><b>Phase 8</b></td><td>Ch 39–40</td><td>+6</td><td>84</td><td><span class="badge-done">✅ สมบูรณ์</span></td><td>Phase 6 + Phase 7</td></tr>
        <tr><td><b>Phase 9</b></td><td>Ch 41–43</td><td>+6</td><td>90</td><td><span class="badge-done">✅ สมบูรณ์</span></td><td>Phase 8</td></tr>
        <tr><td><b>Phase 10</b></td><td>Ch 44–45</td><td>+6</td><td>96</td><td><span class="badge-done">✅ สมบูรณ์</span></td><td>Phase 9</td></tr>
        <tr><td><b>Phase 11</b></td><td>Ch 46–47</td><td>+6</td><td>102</td><td><span class="badge-done">✅ สมบูรณ์</span></td><td>Phase 10</td></tr>
        <tr><td><b>Phase 12</b></td><td>Ch 48–49</td><td>+6</td><td>108</td><td><span class="badge-done">✅ สมบูรณ์</span></td><td>Phase 7 + Phase 11</td></tr>
        <tr><td><b>Phase 13</b></td><td>Ch 50–51</td><td>+6</td><td>114</td><td><span class="badge-done">✅ สมบูรณ์</span></td><td>Phase 6 + Phase 12</td></tr>
        <tr><td><b>Phase 14</b></td><td>Ch 52–53</td><td>+6</td><td>120</td><td><span class="badge-done">✅ สมบูรณ์</span></td><td>Phase 13</td></tr>
        <tr class="row-active"><td><b>Phase 15</b></td><td>Ch 54–55</td><td>+3</td><td><b>123</b></td><td><span class="badge-wip">🔄 กำลังดำเนินการ</span></td><td>Phase 14 + ทุก Phase</td></tr>
      </tbody>
    </table>
  </div>
</div>`;

const _SEARCH_HTML = `<div id="search-overlay" class="search-overlay" onclick="closeSearch()">
  <div class="search-modal" onclick="event.stopPropagation()">
    <div class="search-input-row">
      <span class="search-icon">🔍</span>
      <input type="text" id="search-input" placeholder="ค้นหาข้ามทุก 55 chapters..." autocomplete="off" oninput="debouncedSearch(this.value)">
      <button class="search-close-btn" onclick="closeSearch()">✕</button>
    </div>
    <div id="search-count" class="search-count"></div>
    <div id="search-results" class="search-results-list"></div>
    <div class="search-footer">กด <kbd>Esc</kbd> เพื่อปิด · คลิก Chapter เพื่อเปิด</div>
  </div>
</div>`;

function patchDOM() {
  // Inject search + theme toggle buttons into header (only if missing)
  if (!document.getElementById('theme-toggle')) {
    var hDiv = document.querySelector('#top-header > div');
    if (hDiv) {
      hDiv.insertAdjacentHTML('beforeend',
        '<button class="search-open-btn" onclick="openSearch()" title="ค้นหา (Ctrl+K)">🔍 <kbd>Ctrl+K</kbd></button>' +
        '<button class="theme-toggle-btn" id="theme-toggle" onclick="toggleTheme()" title="เปลี่ยน Theme">🌙</button>'
      );
    }
  }
  // Inject chapter map table (only if missing)
  if (!document.getElementById('chapter-map-section')) {
    var grid = document.querySelector('.phase-grid');
    if (grid) grid.insertAdjacentHTML('afterend', _CMAP_HTML);
  }
  // Inject search overlay modal (only if missing)
  if (!document.getElementById('search-overlay')) {
    document.body.insertAdjacentHTML('beforeend', _SEARCH_HTML);
  }
  // Inject Analytics + Changelog links in sidebar (only if missing)
  if (!document.getElementById('extra-nav-links')) {
    var chList = document.querySelector('.chapter-list');
    if (chList) {
      chList.insertAdjacentHTML('afterend',
        '<div id="extra-nav-links" style="padding:8px 12px;border-top:1px solid #30363d;margin-top:4px;">' +
        '<a href="analytics.html" style="display:flex;align-items:center;gap:8px;padding:6px 8px;color:#8b949e;text-decoration:none;font-size:0.82rem;border-radius:6px;transition:all 0.2s;" onmouseover="this.style.background=\'#21262d\';this.style.color=\'#f78166\'" onmouseout="this.style.background=\'transparent\';this.style.color=\'#8b949e\'">📊 Analytics Dashboard</a>' +
        '<a href="changelog.html" style="display:flex;align-items:center;gap:8px;padding:6px 8px;color:#8b949e;text-decoration:none;font-size:0.82rem;border-radius:6px;transition:all 0.2s;" onmouseover="this.style.background=\'#21262d\';this.style.color=\'#f78166\'" onmouseout="this.style.background=\'transparent\';this.style.color=\'#8b949e\'">📋 Changelog</a>' +
        '</div>'
      );
    }
  }
}
