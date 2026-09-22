/* Catatan Belajar ERP YonSuite — app shell (routing, render, search) */
(() => {
  "use strict";

  const CONTENT_DIR = "content";
  const $app = document.getElementById("app");

  const ICONS = {
    layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>',
    cart: '<circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>',
    trending: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline>',
    box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line>',
    "arrow-down-circle": '<circle cx="12" cy="12" r="10"></circle><polyline points="8 12 12 16 16 12"></polyline><line x1="12" y1="8" x2="12" y2="16"></line>',
    "arrow-up-circle": '<circle cx="12" cy="12" r="10"></circle><polyline points="16 12 12 8 8 12"></polyline><line x1="12" y1="16" x2="12" y2="8"></line>',
    building: '<path d="M5 21V7l7-4 7 4v14"></path><path d="M3 21h18"></path><path d="M9 21v-6h6v6"></path>',
    calculator: '<rect x="4" y="2" width="16" height="20" rx="2"></rect><line x1="8" y1="6" x2="16" y2="6"></line><line x1="8" y1="10" x2="8" y2="10"></line><line x1="12" y1="10" x2="12" y2="10"></line><line x1="16" y1="10" x2="16" y2="10"></line><line x1="8" y1="14" x2="8" y2="14"></line><line x1="12" y1="14" x2="12" y2="14"></line><line x1="16" y1="14" x2="16" y2="14"></line><line x1="8" y1="18" x2="8" y2="18"></line><line x1="12" y1="18" x2="12" y2="18"></line>',
    ledger: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>',
    alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17.02" x2="12" y2="17.02"></line>',
    search: '<circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>',
    menu: '<line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line>',
    x: '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>',
    chevronRight: '<polyline points="9 18 15 12 9 6"></polyline>',
    chevronLeft: '<polyline points="15 18 9 12 15 6"></polyline>',
    compass: '<circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>',
    home: '<path d="M3 10.5 12 3l9 7.5"></path><path d="M5 9.5V21h14V9.5"></path>',
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"></rect><rect x="14" y="3" width="7" height="5" rx="1.5"></rect><rect x="14" y="12" width="7" height="9" rx="1.5"></rect><rect x="3" y="16" width="7" height="5" rx="1.5"></rect>',
    trophy: '<path d="M8 21h8"></path><path d="M12 17v4"></path><path d="M7 4h10v6a5 5 0 0 1-10 0V4z"></path><path d="M7 5H4a2 2 0 0 0 0 4h3"></path><path d="M17 5h3a2 2 0 0 1 0 4h-3"></path>',
    clock: '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>',
    fileText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="16" y2="17"></line>',
  };

  function icon(name, size = 18) {
    const d = ICONS[name] || "";
    return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  }

  function checkIconSvg() {
    return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  }
  function markIconSvg() {
    return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>';
  }

  function slugify(text) {
    const slug = String(text)
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      // Keep any Unicode letter/number (this includes Chinese/Japanese/Korean
      // text, common throughout these notes) instead of only a-z0-9 — the
      // old ASCII-only version stripped non-Latin headings down to almost
      // nothing, so unrelated headings collapsed onto the same anchor id.
      .replace(/[^\p{L}\p{N}-]/gu, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    return slug || "section";
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // ---------------------------------------------------------------------
  // Theme picker (palette: red/blue x mode: light/dark/system)
  // ---------------------------------------------------------------------
  const THEME_KEY = "ys-theme-pref";
  const PALETTES = [
    { id: "red", label: "Merah (Yonyou)", dot: "dot-red" },
    { id: "blue", label: "Biru", dot: "dot-blue" },
  ];
  const MODES = [
    { id: "light", label: "Terang" },
    { id: "dark", label: "Gelap" },
    { id: "system", label: "Sistem" },
  ];

  function loadThemePref() {
    try {
      const raw = localStorage.getItem(THEME_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return { palette: "red", mode: "system" };
  }

  function saveThemePref(pref) {
    try { localStorage.setItem(THEME_KEY, JSON.stringify(pref)); } catch (e) { /* ignore */ }
  }

  function resolveMode(mode) {
    if (mode === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return mode;
  }

  let themePref = loadThemePref();

  function applyTheme() {
    document.documentElement.setAttribute("data-palette", themePref.palette);
    document.documentElement.setAttribute("data-theme", resolveMode(themePref.mode));
  }

  function renderThemePanel() {
    const $panel = document.getElementById("themePanel");
    if (!$panel) return;
    $panel.innerHTML = `
      <div class="theme-panel-section">
        <p class="theme-panel-label">Warna</p>
        <div class="theme-swatch-row">
          ${PALETTES.map((p) => `
            <div class="theme-swatch ${themePref.palette === p.id ? "active" : ""}" data-palette-choice="${p.id}">
              <span class="theme-swatch-dot ${p.dot}"></span>${escapeHtml(p.label)}
            </div>
          `).join("")}
        </div>
      </div>
      <div class="theme-panel-section">
        <p class="theme-panel-label">Mode</p>
        <div class="theme-mode-row">
          ${MODES.map((m) => `
            <div class="theme-mode-btn ${themePref.mode === m.id ? "active" : ""}" data-mode-choice="${m.id}">${escapeHtml(m.label)}</div>
          `).join("")}
        </div>
      </div>
    `;
    $panel.querySelectorAll("[data-palette-choice]").forEach((el) => {
      el.addEventListener("click", () => {
        themePref.palette = el.dataset.paletteChoice;
        saveThemePref(themePref);
        applyTheme();
        renderThemePanel();
      });
    });
    $panel.querySelectorAll("[data-mode-choice]").forEach((el) => {
      el.addEventListener("click", () => {
        themePref.mode = el.dataset.modeChoice;
        saveThemePref(themePref);
        applyTheme();
        renderThemePanel();
      });
    });
  }

  function closeThemePanel() {
    const $panel = document.getElementById("themePanel");
    if ($panel) $panel.classList.remove("open");
  }

  function initThemePicker() {
    applyTheme();
    renderThemePanel();
    document.getElementById("themeToggle").addEventListener("click", (e) => {
      e.stopPropagation();
      document.getElementById("themePanel").classList.toggle("open");
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".theme-picker")) closeThemePanel();
    });
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (themePref.mode === "system") applyTheme();
    });
  }

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  let manifest = null;
  const moduleBySlug = new Map();
  const mdCache = new Map(); // slug -> raw markdown text
  let searchIndex = null; // [{slug, title, isIssueLog, heading, anchor, text}]
  let searchIndexPromise = null;

  // ---------------------------------------------------------------------
  // Markdown rendering
  // ---------------------------------------------------------------------
  function buildRenderer(basePath) {
    const renderer = new marked.Renderer();
    const usedIds = new Map(); // per-render dedup, in case two headings slugify the same
    renderer.heading = (text, level, raw) => {
      let id = slugify(raw);
      if (usedIds.has(id)) {
        const n = usedIds.get(id) + 1;
        usedIds.set(id, n);
        id = `${id}-${n}`;
      } else {
        usedIds.set(id, 1);
      }
      // Only headings that are actually numbered items ("1. ...", "12. ...")
      // get the checklist treatment — plain group-label headings (no number,
      // e.g. "System Parameter") stay as normal headings with no checkbox.
      const rawStripped = raw.replace(/^\*\*/, "").replace(/\*\*$/, "").trim();
      const isNumberedItem = (level === 2 || level === 3) && /^\d+(?:\.\d+)?\.?\s/.test(rawStripped);
      if (isNumberedItem) {
        return `<h${level} id="${id}" class="checkable-heading"><span class="checkable-heading-text">${text}</span><span class="ys-check-cluster" data-check-id="${id}">` +
          `<button type="button" class="ys-mark-btn" data-action="marked" aria-label="Tandai buat direview lagi" title="Tandai (kuning)">${markIconSvg()}</button>` +
          `<button type="button" class="ys-check-btn" data-action="done" aria-label="Tandai udah selesai dipelajari" title="Selesai (hijau)">${checkIconSvg()}</button>` +
          `</span></h${level}>\n`;
      }
      return `<h${level} id="${id}">${text}</h${level}>\n`;
    };
    renderer.image = (href, title, text) => {
      const src = href.startsWith("http") ? href : `${basePath}/${href}`;
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
      return `<img src="${src}" alt="${escapeHtml(text || "")}" loading="lazy"${titleAttr}>`;
    };
    return renderer;
  }

  async function fetchMd(slug) {
    if (mdCache.has(slug)) return mdCache.get(slug);
    const res = await fetch(`${CONTENT_DIR}/${slug}.md`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Gagal memuat ${slug}.md (${res.status})`);
    const text = await res.text();
    mdCache.set(slug, text);
    return text;
  }

  function renderMarkdown(mdText) {
    const renderer = buildRenderer(CONTENT_DIR);
    return marked.parse(mdText, { renderer, gfm: true, breaks: false });
  }

  // ---------------------------------------------------------------------
  // Router
  // ---------------------------------------------------------------------
  function parseHash() {
    let hash = location.hash.replace(/^#/, "");
    if (!hash) hash = "/";
    const [path, query] = hash.split("?");
    const params = new URLSearchParams(query || "");
    return { path, params };
  }

  function navigate(path, params) {
    let hash = `#${path}`;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      if (qs) hash += `?${qs}`;
    }
    if (location.hash === hash) {
      route();
    } else {
      location.hash = hash;
    }
  }

  window.addEventListener("hashchange", route);

  async function route() {
    const { path, params } = parseHash();
    closeSidebar();
    closeSearch();

    if (path === "/" || path === "") {
      renderHome();
    } else if (path === "/dashboard") {
      await renderDashboard();
    } else if (path === "/issue-log") {
      await renderIssueLog(params.get("cat"), params.get("h"), params.get("q"));
    } else if (path.startsWith("/module/")) {
      const slug = path.replace("/module/", "");
      await renderModulePage(slug, params.get("h"), params.get("q"));
    } else {
      renderNotFound();
    }
    updateActiveNav();
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  // ---------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------
  function renderHome() {
    const path = manifest.learningPath.map((slug) => moduleBySlug.get(slug)).filter(Boolean);
    const cards = path.map((m, i) => `
      <div class="path-card" style="animation-delay:${Math.min(i * 45, 300)}ms" data-nav="/module/${m.slug}">
        <div class="path-num">${i + 1}</div>
        <div class="path-body">
          <h3>${escapeHtml(m.title)}</h3>
          <p>${escapeHtml(m.short)}</p>
        </div>
        <div class="path-arrow">${icon("chevronRight", 20)}</div>
      </div>
    `).join("");

    $app.innerHTML = `
      <div class="view">
        <section class="hero">
          <div class="hero-eyebrow">Panduan Belajar YonSuite ERP</div>
          <h1>Mulai belajar dari mana?</h1>
          <p>${escapeHtml(manifest.site.subtitle)}. Ikuti urutan modul di bawah ini — disusun dari fondasi (setup &amp; master data) sampai ke proses transaksi dan closing, biar konsepnya nyambung satu sama lain.</p>
          <div class="hero-actions">
            <button class="btn btn-primary" data-nav="/module/${path[0].slug}">${icon("compass", 16)} Mulai dari ${escapeHtml(path[0].title)}</button>
            <button class="btn btn-ghost" data-nav="/issue-log">${icon("alert", 16)} Lihat Issue Log</button>
          </div>
        </section>

        <h2 class="section-title">Peta Alur Belajar</h2>
        <p class="section-desc">Mindmap urutan &amp; percabangan modul — klik node mana saja untuk langsung buka catatannya.</p>
        ${renderMindmap()}

        <h2 class="section-title">Urutan Belajar yang Disarankan</h2>
        <p class="section-desc">Klik salah satu langkah untuk langsung buka catatannya.</p>
        <div class="path-list">${cards}</div>

        <h2 class="section-title">Semua Modul</h2>
        <p class="section-desc">Akses cepat ke semua catatan, urut sesuai kategori ERP.</p>
        <div class="module-grid">
          ${manifest.modules.map((m) => `
            <div class="module-card" data-nav="/module/${m.slug}">
              <div class="icon-badge">${icon(m.icon, 20)}</div>
              <h3>${escapeHtml(m.title)}</h3>
              <p>${escapeHtml(m.short)}</p>
            </div>
          `).join("")}
        </div>

        <div class="page-footer">Catatan belajar pribadi — ${escapeHtml(manifest.site.owner)} · dibuat untuk dokumentasi eksplorasi YonSuite ERP.</div>
      </div>
    `;
    wireNavClicks();
  }

  const MINDMAP_GROUPS = [
    ["digital-modeling"],
    ["aact-coa"],
    ["inventory"],
    ["purchasing", "sales"],
    ["ap", "ar"],
    ["fa"],
    ["inventory-accounting"],
    ["gl"],
  ];

  function renderMindmap() {
    const stepsHtml = MINDMAP_GROUPS.map((slugs, i) => {
      const nodes = slugs.map((slug) => moduleBySlug.get(slug)).filter(Boolean);
      const nodesHtml = nodes.map((m) => `
        <div class="mm-node" data-nav="/module/${m.slug}">
          <span class="mm-node-icon">${icon(m.icon, 15)}</span>${escapeHtml(m.title)}
        </div>
      `).join("");
      const isBranch = nodes.length > 1;
      return `
        <div class="mm-step">
          <div class="mm-dot">${i + 1}</div>
          <div class="mm-content">
            <div class="${isBranch ? "mm-branch-row" : ""}">${nodesHtml}</div>
          </div>
        </div>
      `;
    }).join("");

    return `
      <div class="mindmap">
        ${stepsHtml}
        <div class="mm-step mm-step-issue">
          <div class="mm-dot mm-dot-issue">${icon("alert", 13)}</div>
          <div class="mm-content">
            <div class="mm-node mm-node-issue" data-nav="/issue-log">Issue Log &amp; Troubleshooting</div>
            <p class="mm-issue-note">Referensi lintas-modul — dicek kapan pun nemu error di tahap manapun di atas.</p>
          </div>
        </div>
      </div>
    `;
  }

  // -----------------------------------------------------------------------
  // Scroll-reveal: fade/slide elements in as they enter the viewport.
  // One-shot (unobserves once revealed) so it doesn't replay on scroll-up.
  // -----------------------------------------------------------------------
  function initScrollReveal(container) {
    const els = container.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("reveal-visible"));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("reveal-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    els.forEach((el) => observer.observe(el));
  }

  function timeAgo(iso) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return "Baru saja";
    if (min < 60) return `${min} menit lalu`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} jam lalu`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day} hari lalu`;
    const week = Math.floor(day / 7);
    if (week < 5) return `${week} minggu lalu`;
    const month = Math.floor(day / 30);
    if (month < 12) return `${month} bulan lalu`;
    return `${Math.floor(day / 365)} tahun lalu`;
  }

  async function renderDashboard() {
    showSkeleton();
    const visits = loadVisits();
    const totalModules = manifest.modules.length;
    const visitedSlugs = Object.keys(visits).filter((slug) => moduleBySlug.has(slug));
    const visitedCount = visitedSlugs.length;
    const pct = totalModules ? Math.round((visitedCount / totalModules) * 100) : 0;

    const recentVisits = visitedSlugs
      .map((slug) => ({ slug, at: visits[slug], m: moduleBySlug.get(slug) }))
      .sort((a, b) => new Date(b.at) - new Date(a.at));
    const lastVisit = recentVisits[0] || null;

    const catCounts = {};
    let totalIssues = 0;
    try {
      const md = await fetchMd(manifest.issueLog.slug);
      const matches = md.match(/data-category="([^"]+)"/g) || [];
      matches.forEach((raw) => {
        const key = raw.match(/data-category="([^"]+)"/)[1];
        catCounts[key] = (catCounts[key] || 0) + 1;
        totalIssues++;
      });
    } catch (e) { /* stats are best-effort, don't block the page on this */ }
    const maxCatCount = Math.max(1, ...Object.values(catCounts));
    const topCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0];

    const firstModuleSlug = manifest.learningPath[0];
    const firstModule = moduleBySlug.get(firstModuleSlug);

    $app.innerHTML = `
      <div class="view">
        <section class="hero reveal">
          <div class="hero-eyebrow">${icon("dashboard", 14)} Dashboard</div>
          <h1>Progress Belajar Kamu</h1>
          <p>Ringkasan sejauh mana kamu udah menjelajah catatan YonSuite ERP ini, plus insight dari Issue Log.</p>
        </section>

        <div class="dash-stats reveal">
          <div class="dash-stat-card">
            <div class="dash-stat-icon">${icon("fileText", 20)}</div>
            <div class="dash-stat-value">${totalModules}</div>
            <div class="dash-stat-label">Total Modul</div>
          </div>
          <div class="dash-stat-card">
            <div class="dash-stat-icon">${icon("trophy", 20)}</div>
            <div class="dash-stat-value">${visitedCount}/${totalModules}</div>
            <div class="dash-stat-label">Modul Dibuka</div>
          </div>
          <div class="dash-stat-card">
            <div class="dash-stat-icon">${icon("alert", 20)}</div>
            <div class="dash-stat-value">${totalIssues}</div>
            <div class="dash-stat-label">Entri Issue Log</div>
          </div>
          <div class="dash-stat-card">
            <div class="dash-stat-icon">${icon("clock", 20)}</div>
            <div class="dash-stat-value dash-stat-value-sm">${lastVisit ? timeAgo(lastVisit.at) : "—"}</div>
            <div class="dash-stat-label">Terakhir Belajar</div>
          </div>
        </div>

        <div class="dash-progress-section reveal">
          <div class="dash-progress-head">
            <h2 class="section-title" style="margin-top:0">Progress Modul</h2>
            <span class="dash-progress-pct">${pct}%</span>
          </div>
          <div class="dash-progress-bar"><div class="dash-progress-fill" data-fill="${pct}"></div></div>
          <p class="section-desc">${visitedCount} dari ${totalModules} modul udah kamu buka.</p>
        </div>

        <h2 class="section-title">Sebaran Issue Log per Kategori</h2>
        <p class="section-desc">${totalIssues} entri total${topCat ? `, paling banyak di "${escapeHtml(manifest.categories[topCat[0]] ? manifest.categories[topCat[0]].label : topCat[0])}"` : ""}.</p>
        <div class="dash-chart reveal">
          ${Object.entries(manifest.categories).map(([key, c]) => {
            const count = catCounts[key] || 0;
            const width = Math.round((count / maxCatCount) * 100);
            return `
              <div class="dash-chart-row">
                <span class="dash-chart-label">${escapeHtml(c.label)}</span>
                <div class="dash-chart-track"><div class="dash-chart-fill" data-fill="${width}" style="background:${c.color}"></div></div>
                <span class="dash-chart-count">${count}</span>
              </div>
            `;
          }).join("")}
        </div>

        <h2 class="section-title">Modul Terakhir Dibuka</h2>
        <p class="section-desc">${recentVisits.length ? "Riwayat modul yang udah kamu buka, urut dari yang paling baru." : "Belum ada modul yang dibuka di device ini."}</p>
        <div class="dash-recent-list">
          ${recentVisits.slice(0, 6).map((v, i) => `
            <div class="dash-recent-item reveal" style="transition-delay:${Math.min(i * 60, 300)}ms" data-nav="/module/${v.slug}">
              <div class="icon-badge">${icon(v.m.icon, 18)}</div>
              <div class="dash-recent-body">
                <h3>${escapeHtml(v.m.title)}</h3>
                <p>${timeAgo(v.at)}</p>
              </div>
              ${icon("chevronRight", 18)}
            </div>
          `).join("")}
          ${!recentVisits.length ? `<div class="dash-empty reveal" data-nav="/module/${firstModuleSlug}">${icon("compass", 18)} Yuk mulai dari <strong>&nbsp;${escapeHtml(firstModule.title)}</strong></div>` : ""}
        </div>

        ${visitedCount > 0 ? `<button class="dash-reset-btn" id="dashResetProgress">Reset progress belajar</button>` : ""}

        <div class="page-footer">Statistik ini cuma tersimpan di browser kamu sendiri (localStorage) — nggak dikirim atau disimpan di server manapun.</div>
      </div>
    `;
    wireNavClicks();
    initScrollReveal($app);
    requestAnimationFrame(() => {
      $app.querySelectorAll("[data-fill]").forEach((el) => {
        el.style.width = el.dataset.fill + "%";
      });
    });

    const $reset = document.getElementById("dashResetProgress");
    if ($reset) {
      $reset.addEventListener("click", () => {
        if (confirm("Reset semua progress modul yang udah dibuka?")) {
          localStorage.removeItem(VISITS_KEY);
          renderDashboard();
        }
      });
    }
  }

  // -----------------------------------------------------------------------
  // Jump straight to the exact matched text after a search click (like
  // browser Ctrl+F) instead of just scrolling to the section heading.
  // Falls back to the heading anchor when the phrase can't be located.
  // -----------------------------------------------------------------------
  function findRangeForQuery(root, query) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let text = "";
    let node;
    while ((node = walker.nextNode())) {
      nodes.push({ node, start: text.length });
      text += node.textContent;
    }
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return null;
    const end = idx + query.length;

    const locate = (offset) => {
      for (const n of nodes) {
        const nodeEnd = n.start + n.node.textContent.length;
        if (offset <= nodeEnd) return { node: n.node, offset: Math.max(0, offset - n.start) };
      }
      const last = nodes[nodes.length - 1];
      return { node: last.node, offset: last.node.textContent.length };
    };

    const range = document.createRange();
    const startLoc = locate(idx);
    const endLoc = locate(end);
    range.setStart(startLoc.node, startLoc.offset);
    range.setEnd(endLoc.node, endLoc.offset);
    return range;
  }

  function highlightAndScrollToQuery(query) {
    const root = $app.querySelector(".markdown-body");
    if (!root || !query) return false;
    const trimmed = query.trim();
    const firstWord = trimmed.split(/\s+/)[0];
    const attempts = firstWord && firstWord !== trimmed ? [trimmed, firstWord] : [trimmed];
    for (const attempt of attempts) {
      if (!attempt) continue;
      const range = findRangeForQuery(root, attempt);
      if (!range) continue;
      try {
        const mark = document.createElement("mark");
        mark.className = "search-jump-hit";
        range.surroundContents(mark);
        mark.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => mark.classList.add("search-jump-hit-fade"), 2200);
        return true;
      } catch (e) {
        console.warn("highlight failed, trying next fallback", e);
      }
    }
    return false;
  }

  function jumpToResult(anchor, query) {
    requestAnimationFrame(() => {
      if (highlightAndScrollToQuery(query)) return;
      if (anchor) {
        const el = document.getElementById(anchor);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          el.classList.add("flash-highlight");
        }
      }
    });
  }

  // ---------------------------------------------------------------------
  // "Udah dipelajari" checklist (localStorage) — each H3 setting/heading
  // gets a status: "done" (hijau) or "marked" (kuning, buat direview lagi),
  // scoped per page (module slug or the issue log). A small progress badge
  // in the page header shows total/done/marked counts.
  // ---------------------------------------------------------------------
  const CHECKLIST_KEY = "ys-checklist";
  function loadChecklist() {
    try { return JSON.parse(localStorage.getItem(CHECKLIST_KEY)) || {}; } catch (e) { return {}; }
  }
  function normalizeStatus(raw) {
    if (raw === true) return "done"; // legacy boolean format
    if (raw === "done" || raw === "marked") return raw;
    return null;
  }
  function setChecklistItem(pageKey, checkId, status) {
    try {
      const all = loadChecklist();
      if (!all[pageKey]) all[pageKey] = {};
      if (status) all[pageKey][checkId] = status;
      else delete all[pageKey][checkId];
      localStorage.setItem(CHECKLIST_KEY, JSON.stringify(all));
    } catch (e) { /* ignore (private browsing etc.) */ }
  }
  function renderProgressBadge(counts) {
    if (!counts.total) return "";
    return `
      <div class="doc-progress-badge" title="${counts.done} selesai, ${counts.marked} ditandai, dari ${counts.total} soal">
        <span class="dpb-item dpb-done"><span class="dpb-dot"></span>${counts.done}</span>
        <span class="dpb-item dpb-marked"><span class="dpb-dot"></span>${counts.marked}</span>
        <span class="dpb-total">/ ${counts.total} soal</span>
      </div>
    `;
  }
  function closeMarkedPanel() {
    const $panel = document.getElementById("docMarkedPanel");
    if ($panel) $panel.classList.remove("open");
  }
  function jumpToHeading(heading) {
    heading.scrollIntoView({ behavior: "smooth", block: "start" });
    heading.classList.remove("flash-highlight");
    void heading.offsetWidth; // restart the animation if it was just played
    heading.classList.add("flash-highlight");
  }
  // "Ditandai" button: a dropdown listing every heading currently marked
  // (kuning) on this page, so it's easy to jump back to something flagged
  // for review without having to scroll around looking for it.
  function applyChecklist(pageKey) {
    const $badge = document.getElementById("docProgressBadge");
    const $markedBtn = document.getElementById("docMarkedBtn");
    const $markedPanel = document.getElementById("docMarkedPanel");
    const headings = Array.from($app.querySelectorAll(".checkable-heading"));
    const items = headings.map((h) => {
      const cluster = h.querySelector(".ys-check-cluster");
      if (!cluster) return null;
      const labelEl = h.querySelector(".checkable-heading-text");
      return { id: cluster.dataset.checkId, heading: h, cluster, label: labelEl ? labelEl.textContent.trim() : "" };
    }).filter(Boolean);

    if ($badge) $badge.innerHTML = "";
    if ($markedBtn) $markedBtn.parentElement.style.display = "none";
    if (!items.length) return;

    const savedState = loadChecklist()[pageKey] || {};
    items.forEach((it) => { it.status = normalizeStatus(savedState[it.id]); });

    function paint(it) {
      it.heading.classList.toggle("checklist-done", it.status === "done");
      it.heading.classList.toggle("checklist-marked", it.status === "marked");
      it.cluster.querySelectorAll("button").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.action === it.status);
      });
    }
    function paintBadge() {
      if (!$badge) return;
      const counts = { total: items.length, done: 0, marked: 0 };
      items.forEach((it) => {
        if (it.status === "done") counts.done++;
        else if (it.status === "marked") counts.marked++;
      });
      $badge.innerHTML = renderProgressBadge(counts);
    }
    function paintMarkedButton() {
      if (!$markedBtn || !$markedPanel) return;
      const marked = items.filter((it) => it.status === "marked");
      $markedBtn.parentElement.style.display = "";
      $markedBtn.innerHTML = `${markIconSvg()} Ditandai <span class="doc-marked-count">${marked.length}</span>`;
      $markedPanel.innerHTML = marked.length
        ? marked.map((it) => `<div class="doc-marked-item" data-check-id="${it.id}">${escapeHtml(it.label)}</div>`).join("")
        : `<div class="doc-marked-empty">Belum ada yang ditandai kuning.</div>`;
      $markedPanel.querySelectorAll(".doc-marked-item").forEach((el) => {
        el.addEventListener("click", () => {
          const it = marked.find((m) => m.id === el.dataset.checkId);
          closeMarkedPanel();
          if (it) jumpToHeading(it.heading);
        });
      });
    }
    function setStatus(it, status) {
      it.status = status;
      setChecklistItem(pageKey, it.id, status);
      paint(it);
      paintBadge();
      paintMarkedButton();
    }

    items.forEach((it) => {
      paint(it);
      it.cluster.querySelectorAll("button").forEach((btn) => {
        btn.addEventListener("click", () => {
          const isActive = btn.classList.contains("active");
          setStatus(it, isActive ? null : btn.dataset.action);
        });
      });
    });

    if ($markedBtn) {
      $markedBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        $markedPanel.classList.toggle("open");
      });
    }

    paintBadge();
    paintMarkedButton();
  }

  // ---------------------------------------------------------------------
  // Visit tracking (localStorage) — powers the Dashboard's progress stats
  // ---------------------------------------------------------------------
  const VISITS_KEY = "ys-module-visits";
  function loadVisits() {
    try { return JSON.parse(localStorage.getItem(VISITS_KEY)) || {}; } catch (e) { return {}; }
  }
  function trackVisit(slug) {
    try {
      const visits = loadVisits();
      visits[slug] = new Date().toISOString();
      localStorage.setItem(VISITS_KEY, JSON.stringify(visits));
    } catch (e) { /* ignore (private browsing etc.) */ }
  }

  async function renderModulePage(slug, anchor, query) {
    const m = moduleBySlug.get(slug);
    if (!m) return renderNotFound();
    showSkeleton();
    try {
      const md = await fetchMd(slug);
      const html = renderMarkdown(md);
      const path = manifest.learningPath;
      const idx = path.indexOf(slug);
      const prev = idx > 0 ? moduleBySlug.get(path[idx - 1]) : null;
      const next = idx >= 0 && idx < path.length - 1 ? moduleBySlug.get(path[idx + 1]) : null;

      $app.innerHTML = `
        <div class="view">
          <div class="doc-header">
            <div class="doc-header-row">
              <div>
                <div class="doc-eyebrow">Modul ${idx >= 0 ? idx + 1 : ""} · Catatan Belajar</div>
                <h1>${escapeHtml(m.title)}</h1>
              </div>
              <div class="doc-header-actions">
                <div id="docProgressBadge"></div>
                <div class="doc-marked-picker">
                  <button type="button" class="doc-marked-btn" id="docMarkedBtn"></button>
                  <div class="doc-marked-panel" id="docMarkedPanel"></div>
                </div>
                <div class="doc-edit-slot" data-slug="${slug}"></div>
              </div>
            </div>
          </div>
          <div class="markdown-body">${html}</div>
          <div class="doc-nav">
            ${prev ? `<a class="prev" data-nav="/module/${prev.slug}"><span class="nav-label">${icon("chevronLeft", 12)} Sebelumnya</span>${escapeHtml(prev.title)}</a>` : "<span></span>"}
            ${next ? `<a class="next" data-nav="/module/${next.slug}"><span class="nav-label">Selanjutnya ${icon("chevronRight", 12)}</span>${escapeHtml(next.title)}</a>` : "<span></span>"}
          </div>
        </div>
      `;
      wireNavClicks();
      applyChecklist(slug);
      if (window.YSEditor) window.YSEditor.mount();
      if (anchor || query) jumpToResult(anchor, query);
      trackVisit(slug);
    } catch (err) {
      renderError(m.title, err);
    }
  }

  async function renderIssueLog(activeCat, anchor, query) {
    showSkeleton();
    try {
      const md = await fetchMd(manifest.issueLog.slug);
      const html = renderMarkdown(md);
      const cats = manifest.categories;

      $app.innerHTML = `
        <div class="view">
          <div class="doc-header">
            <div class="doc-header-row">
              <div>
                <div class="doc-eyebrow" style="color:${cats.sequencing.color}">${icon("alert", 14)} Referensi Troubleshooting</div>
                <h1>${escapeHtml(manifest.issueLog.title)}</h1>
              </div>
              <div class="doc-header-actions">
                <div id="docProgressBadge"></div>
                <div class="doc-marked-picker">
                  <button type="button" class="doc-marked-btn" id="docMarkedBtn"></button>
                  <div class="doc-marked-panel" id="docMarkedPanel"></div>
                </div>
                <div class="doc-edit-slot" data-slug="${manifest.issueLog.slug}"></div>
              </div>
            </div>
          </div>
          <div class="issue-filter-bar">
            <div class="issue-chip ${!activeCat ? "active" : ""}" data-cat="" style="${!activeCat ? "background:#1f2937;border-color:#1f2937" : ""}">Semua</div>
            ${Object.entries(cats).map(([key, c]) => `
              <div class="issue-chip ${activeCat === key ? "active" : ""}" data-cat="${key}" style="${activeCat === key ? `background:${c.color};border-color:${c.color}` : ""}">${escapeHtml(c.label)}</div>
            `).join("")}
          </div>
          <div class="markdown-body">${html}</div>
        </div>
      `;
      wireNavClicks();
      decorateIssueCards();
      applyIssueFilter(activeCat);
      applyChecklist(manifest.issueLog.slug);
      if (window.YSEditor) window.YSEditor.mount();
      if (anchor || query) jumpToResult(anchor, query);

      $app.querySelectorAll(".issue-chip").forEach((chip) => {
        chip.addEventListener("click", () => {
          const cat = chip.dataset.cat || null;
          navigate("/issue-log", cat ? { cat } : {});
        });
      });
    } catch (err) {
      renderError(manifest.issueLog.title, err);
    }
  }

  function decorateIssueCards() {
    const cats = manifest.categories;
    $app.querySelectorAll(".issue-card").forEach((card) => {
      const cat = card.dataset.category;
      const meta = cats[cat];
      if (!meta) return;
      const firstHeading = card.querySelector("h2, h3");
      const badge = document.createElement("span");
      badge.className = "issue-badge";
      badge.style.background = meta.color;
      badge.textContent = meta.label;
      if (firstHeading) firstHeading.insertAdjacentElement("beforebegin", badge);
    });
  }

  function applyIssueFilter(cat) {
    $app.querySelectorAll(".issue-card").forEach((card) => {
      const show = !cat || card.dataset.category === cat;
      card.classList.toggle("is-hidden", !show);
    });
  }

  function renderNotFound() {
    $app.innerHTML = `
      <div class="view">
        <h1>Halaman tidak ditemukan</h1>
        <p>Coba kembali ke <a href="#/">halaman utama</a>.</p>
      </div>
    `;
  }

  function renderError(title, err) {
    console.error(err);
    $app.innerHTML = `
      <div class="view">
        <div class="doc-header"><h1>${escapeHtml(title)}</h1></div>
        <p>Konten belum bisa dimuat. Pastikan file markdown-nya ada di folder <code>/content</code>.</p>
        <p style="color:var(--color-text-faint);font-size:12.5px;">${escapeHtml(err.message || String(err))}</p>
      </div>
    `;
  }

  function showSkeleton() {
    $app.innerHTML = `
      <div class="view">
        <div class="skeleton">
          <div class="bar" style="width:40%;height:26px;"></div>
          <div class="bar" style="width:90%;"></div>
          <div class="bar" style="width:75%;"></div>
          <div class="bar" style="width:85%;"></div>
          <div class="bar" style="width:60%;"></div>
        </div>
      </div>
    `;
  }

  function wireNavClicks() {
    document.querySelectorAll("[data-nav]").forEach((el) => {
      if (el.dataset.navWired) return;
      el.dataset.navWired = "1";
      el.addEventListener("click", () => navigate(el.dataset.nav));
    });
  }

  // ---------------------------------------------------------------------
  // Sidebar
  // ---------------------------------------------------------------------
  function renderSidebar() {
    const $sidebar = document.getElementById("sidebar");
    const pathModules = manifest.learningPath.map((slug) => moduleBySlug.get(slug)).filter(Boolean);

    $sidebar.innerHTML = `
      <div class="brand" data-nav="/" style="cursor:pointer">
        <div class="brand-logo">YS</div>
        <div class="brand-text">
          <div class="brand-title">${escapeHtml(manifest.site.title)}</div>
          <div class="brand-subtitle">YonSuite ERP Notes</div>
        </div>
      </div>

      <div class="nav-link" data-nav="/" data-route="/">
        ${icon("home")} Panduan Belajar
      </div>
      <div class="nav-link" data-nav="/dashboard" data-route="/dashboard">
        ${icon("dashboard")} Dashboard
      </div>

      <div class="nav-section-title">Modul (urutan belajar)</div>
      ${pathModules.map((m, i) => `
        <div class="nav-link" data-nav="/module/${m.slug}" data-route="/module/${m.slug}">
          <span class="step-num">${i + 1}</span> ${escapeHtml(m.title)}
        </div>
      `).join("")}

      <div class="nav-section-title">Referensi</div>
      <div class="nav-link issue-link" data-nav="/issue-log" data-route="/issue-log">
        ${icon("alert")} Issue Log &amp; Troubleshooting
      </div>

      <div class="sidebar-footer">© ${new Date().getFullYear()} ${escapeHtml(manifest.site.owner)} — dokumentasi belajar pribadi.</div>
    `;
    wireNavClicks();
  }

  function updateActiveNav() {
    const { path } = parseHash();
    document.querySelectorAll(".nav-link").forEach((el) => {
      el.classList.toggle("active", el.dataset.route === path);
    });
  }

  function openSidebar() {
    document.getElementById("sidebar").classList.add("open");
    document.getElementById("sidebarOverlay").classList.add("open");
  }
  function closeSidebar() {
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("sidebarOverlay").classList.remove("open");
  }

  const SIDEBAR_COLLAPSE_KEY = "ys-sidebar-collapsed";
  function initSidebarCollapse() {
    const $btn = document.getElementById("sidebarCollapseToggle");
    if (!$btn) return;
    $btn.addEventListener("click", () => {
      const collapsed = document.documentElement.getAttribute("data-sidebar") === "collapsed";
      const next = collapsed ? "expanded" : "collapsed";
      document.documentElement.setAttribute("data-sidebar", next);
      try { localStorage.setItem(SIDEBAR_COLLAPSE_KEY, next === "collapsed" ? "1" : "0"); } catch (e) { /* ignore */ }
    });
  }

  // ---------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------
  // Build the search index from the exact same HTML the pages themselves
  // render (renderMarkdown), then read headings' real `id` attributes back
  // out of that HTML — instead of recomputing slugs from raw markdown text
  // with a second, separately-maintained parser. Two independent slug
  // implementations drifted apart (links/entities/CJK edge cases), which is
  // what caused search results to jump to the wrong section: this way the
  // anchor a search result links to is always the id that's actually on
  // the rendered page, by construction.
  function extractSectionsFromHtml(html, slug, title, isIssueLog) {
    const container = document.createElement("div");
    container.innerHTML = html;
    const sections = [];
    let current = { heading: title, anchor: "", buf: [], category: null };

    const finalize = () => {
      const text = current.buf.join(" ").replace(/\s+/g, " ").trim();
      if (text.length > 3) {
        sections.push({
          slug, title, isIssueLog,
          heading: current.heading,
          anchor: current.anchor,
          text,
          category: current.category,
        });
      }
    };

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === 1 && (node.tagName === "H2" || node.tagName === "H3")) {
        finalize();
        const card = node.closest(".issue-card");
        current = {
          heading: node.textContent.trim(),
          anchor: node.id || "",
          buf: [],
          category: card ? card.dataset.category : null,
        };
      } else if (node.nodeType === 3) {
        if (node.parentElement && node.parentElement.closest("h2, h3")) continue; // already captured as `heading`
        current.buf.push(node.textContent);
      }
    }
    finalize();
    return sections;
  }

  async function buildSearchIndex() {
    if (searchIndexPromise) return searchIndexPromise;
    searchIndexPromise = (async () => {
      const all = [];
      const jobs = manifest.modules.map((m) => ({ slug: m.slug, title: m.title, isIssueLog: false }));
      jobs.push({ slug: manifest.issueLog.slug, title: manifest.issueLog.title, isIssueLog: true });

      await Promise.all(jobs.map(async (job) => {
        try {
          const md = await fetchMd(job.slug);
          const html = renderMarkdown(md);
          const sections = extractSectionsFromHtml(html, job.slug, job.title, job.isIssueLog);
          all.push(...sections);
        } catch (e) {
          console.warn("search index: skip", job.slug, e);
        }
      }));
      searchIndex = all;
      return all;
    })();
    return searchIndexPromise;
  }

  function scoreMatch(section, qWords) {
    const hay = (section.heading + " " + section.text).toLowerCase();
    let score = 0;
    for (const w of qWords) {
      if (!w) continue;
      const inHeading = section.heading.toLowerCase().includes(w);
      const inText = section.text.toLowerCase().includes(w);
      if (inHeading) score += 5;
      if (inText) score += 1;
      if (!inHeading && !inText) return -1;
    }
    return score;
  }

  function snippetAround(text, q) {
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text.slice(0, 110);
    const start = Math.max(0, idx - 40);
    const end = Math.min(text.length, idx + q.length + 70);
    return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
  }

  function highlightText(text, qWords) {
    let out = escapeHtml(text);
    for (const w of qWords) {
      if (!w) continue;
      const re = new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
      out = out.replace(re, "<mark>$1</mark>");
    }
    return out;
  }

  let searchDebounce = null;
  function onSearchInput(e) {
    const q = e.target.value.trim();
    clearTimeout(searchDebounce);
    if (!q) {
      renderSearchResults([], "");
      return;
    }
    searchDebounce = setTimeout(async () => {
      await buildSearchIndex();
      const qWords = q.toLowerCase().split(/\s+/).filter(Boolean);
      const scored = searchIndex
        .map((s) => ({ s, score: scoreMatch(s, qWords) }))
        .filter((r) => r.score >= 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 30);
      renderSearchResults(scored, q);
    }, 120);
  }

  function renderSearchResults(scored, q) {
    const $results = document.getElementById("searchResults");
    if (!q) {
      $results.classList.remove("open");
      $results.innerHTML = "";
      return;
    }
    if (!scored.length) {
      $results.innerHTML = `<div class="search-results-empty">Tidak ada hasil untuk "${escapeHtml(q)}"</div>`;
      $results.classList.add("open");
      return;
    }
    const qWords = q.toLowerCase().split(/\s+/).filter(Boolean);
    const groups = new Map();
    for (const { s } of scored) {
      const key = s.title;
      if (!groups.has(key)) groups.set(key, { s, items: [] });
      groups.get(key).items.push(s);
    }

    let html = "";
    for (const [title, group] of groups) {
      html += `<div class="search-group"><div class="search-group-title">${escapeHtml(title)}</div>`;
      for (const s of group.items.slice(0, 5)) {
        const snippet = snippetAround(s.text, qWords[0] || "");
        const path = s.isIssueLog ? "/issue-log" : `/module/${s.slug}`;
        html += `<div class="search-result-item" data-path="${path}" data-h="${s.anchor || ""}">
          <div class="search-result-heading">${highlightText(s.heading, qWords)}</div>
          <div class="search-result-snippet">${highlightText(snippet, qWords)}</div>
        </div>`;
      }
      html += `</div>`;
    }
    $results.innerHTML = html;
    $results.classList.add("open");

    $results.querySelectorAll(".search-result-item").forEach((el) => {
      el.addEventListener("click", () => {
        const path = el.dataset.path;
        const h = el.dataset.h;
        const params = {};
        if (h) params.h = h;
        if (q) params.q = q;
        navigate(path, params);
        closeSearch();
        document.getElementById("searchInput").value = "";
      });
    });
  }

  function closeSearch() {
    const $results = document.getElementById("searchResults");
    $results.classList.remove("open");
  }

  function initScrollTopButton() {
    const $btn = document.getElementById("scrollTopBtn");
    if (!$btn) return;
    let ticking = false;
    const update = () => {
      $btn.classList.toggle("visible", window.scrollY > 400);
      ticking = false;
    };
    window.addEventListener("scroll", () => {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    });
    $btn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------
  async function boot() {
    initThemePicker();
    initSidebarCollapse();
    initScrollTopButton();

    const res = await fetch(`${CONTENT_DIR}/manifest.json`, { cache: "no-store" });
    manifest = await res.json();
    manifest.modules.forEach((m) => moduleBySlug.set(m.slug, m));
    document.title = manifest.site.title;
    renderSidebar();
    await route();

    document.getElementById("hamburger").addEventListener("click", openSidebar);
    document.getElementById("sidebarOverlay").addEventListener("click", closeSidebar);
    document.getElementById("searchInput").addEventListener("input", onSearchInput);
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".search-wrap")) closeSearch();
      if (!e.target.closest(".doc-marked-picker")) closeMarkedPanel();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement.tagName !== "INPUT") {
        e.preventDefault();
        document.getElementById("searchInput").focus();
      }
      if (e.key === "Escape") {
        closeSearch();
        closeSidebar();
        closeThemePanel();
        closeMarkedPanel();
        document.getElementById("searchInput").blur();
      }
    });

    setTimeout(() => buildSearchIndex(), 800);
  }

  boot().catch((err) => {
    console.error(err);
    $app.innerHTML = `<div class="view"><h1>Gagal memuat situs</h1><p>${escapeHtml(err.message || String(err))}</p></div>`;
  });

  // Exposed so editor.js can reuse the exact same markdown rendering (live preview)
  // and reload a module's content right after a save, without a full page reload.
  window.YSApp = {
    renderMarkdown,
    CONTENT_DIR,
    escapeHtml,
    get manifest() { return manifest; },
    invalidateCache(slug) { mdCache.delete(slug); },
    setCachedContent(slug, text) { mdCache.set(slug, text); },
    resetSearchIndex() { searchIndex = null; searchIndexPromise = null; },
    reroute() { route(); },
  };
})();
