(function () {
  "use strict";

  const API_BASE = window.AUTOMEDI_API_BASE || "/api";

  /* ---------------- tiny fetch helper ---------------- */
  async function api(path, options) {
    const res = await fetch(API_BASE + path, options || {});
    if (res.status === 204) return null;
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      /* no body */
    }
    if (!res.ok) {
      throw new Error((data && data.error) || "Request failed (" + res.status + ")");
    }
    return data;
  }

  /* ---------------- helpers ---------------- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function inr(n) { return "₹" + Math.round(n).toLocaleString("en-IN"); }
  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function fmtTime(iso) {
    try {
      return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    } catch (e) { return iso; }
  }
  function animateNumber(el, from, to, duration, formatter) {
    duration = duration || 800;
    formatter = formatter || ((v) => Math.round(v).toString());
    const start = performance.now();
    function tick(now) {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = formatter(from + (to - from) * eased);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ---------------- client-side highlighting (cheap, no network) ----------
     The KEYWORDS list is fetched ONCE from GET /api/keywords on load. Every
     keystroke after that just re-runs a local regex match against that
     cached list — this is what makes the entity linker feel instant. The
     authoritative computation (codes, confidence, compliance, revenue,
     summary) never runs on a keystroke; it only runs via POST
     /api/engine/run, which is triggered once per "Run Engine" click. -------- */
  function findMatches(text, keywords) {
    let raw = [];
    keywords.forEach((entry) => {
      entry.patterns.forEach((p) => {
        const re = new RegExp("\\b" + escapeRegex(p) + "\\b", "gi");
        let m;
        while ((m = re.exec(text))) {
          raw.push({ start: m.index, end: m.index + m[0].length, entry });
          if (m.index === re.lastIndex) re.lastIndex++;
        }
      });
    });
    raw.sort((a, b) => b.end - b.start - (a.end - a.start));
    const accepted = [];
    raw.forEach((m) => {
      const overlap = accepted.some((a) => m.start < a.end && m.end > a.start);
      if (!overlap) accepted.push(m);
    });
    accepted.sort((a, b) => a.start - b.start);
    return accepted;
  }
  function buildHighlightHTML(text, matches) {
    let out = "", cursor = 0;
    matches.forEach((m) => {
      out += escapeHtml(text.slice(cursor, m.start));
      out += '<mark data-entity="' + m.entry.id + '">' + escapeHtml(text.slice(m.start, m.end)) + "</mark>";
      cursor = m.end;
    });
    out += escapeHtml(text.slice(cursor));
    return out + "\n";
  }

  /* ---------------- state ---------------- */
  const state = {
    patients: [],
    keywords: [],
    selectedPatientId: null,
    lastResultByPatient: {},
    hasRunOnce: {}
  };
  function getPatient(id) { return state.patients.find((p) => p.id === id); }

  /* ---------------- toast ---------------- */
  function toast(msg, type) {
    type = type || "info";
    const stack = document.getElementById("toastStack");
    const el = document.createElement("div");
    el.className = "toast " + type;
    const icon = type === "success" ? "✅" : type === "warning" ? "⚠️" : "💬";
    el.innerHTML = "<span>" + icon + "</span><span>" + escapeHtml(msg) + "</span>";
    stack.appendChild(el);
    setTimeout(() => {
      el.classList.add("leaving");
      setTimeout(() => el.remove(), 250);
    }, 3600);
  }

  function openModal(html) {
    document.getElementById("modalBody").innerHTML = '<button class="modal-close" id="modalCloseBtn">✕</button>' + html;
    document.getElementById("modalBackdrop").hidden = false;
    document.getElementById("modalCloseBtn").addEventListener("click", closeModal);
  }
  function closeModal() { document.getElementById("modalBackdrop").hidden = true; }
  document.getElementById("modalBackdrop").addEventListener("click", function (e) {
    if (e.target === this) closeModal();
  });

  /* ---------------- navigation ---------------- */
  const PAGES = ["home", "workspace", "register", "analytics"];
  function navigate(page) {
    if (PAGES.indexOf(page) === -1) page = "home";
    PAGES.forEach((p) => { document.getElementById("page-" + p).hidden = p !== page; });
    document.querySelectorAll(".navlink").forEach((b) => b.classList.toggle("active", b.dataset.nav === page));
    window.scrollTo({ top: 0, behavior: "auto" });
    if (location.hash.slice(1) !== page) history.replaceState(null, "", "#" + page);
    if (page === "register") refreshRosterPage();
    if (page === "analytics") refreshAnalyticsPage();
  }
  document.querySelectorAll("[data-nav]").forEach((el) => el.addEventListener("click", () => navigate(el.dataset.nav)));
  window.addEventListener("hashchange", () => {
    const p = location.hash.slice(1);
    if (PAGES.indexOf(p) !== -1) navigate(p);
  });

  /* ---------------- roster select (workspace) ---------------- */
  function renderRosterSelect() {
    const sel = document.getElementById("patientSelect");
    const groups = {}, order = [];
    state.patients.forEach((p) => {
      if (!groups[p.group]) { groups[p.group] = []; order.push(p.group); }
      groups[p.group].push(p);
    });
    sel.innerHTML = order.map((g) =>
      '<optgroup label="' + escapeHtml(g) + '">' +
      groups[g].map((p) => '<option value="' + p.id + '">' + escapeHtml(p.uhid + ": " + p.name + " — " + p.location + ", " + p.department + " (" + p.tpa + ")") + "</option>").join("") +
      "</optgroup>"
    ).join("");
    if (state.selectedPatientId) sel.value = state.selectedPatientId;
  }
  document.getElementById("patientSelect").addEventListener("change", function () {
    state.selectedPatientId = this.value;
    loadPatientIntoWorkspace(true);
  });

  function loadPatientIntoWorkspace(autoRun) {
    const p = getPatient(state.selectedPatientId);
    if (!p) return;
    document.getElementById("pUhid").textContent = p.uhid;
    document.getElementById("pAgeGender").textContent = p.age + " yrs / " + p.gender;
    document.getElementById("pBlood").textContent = p.bloodGroup;
    document.getElementById("pConsultant").textContent = p.consultant;
    document.getElementById("pLocation").textContent = p.location + " · " + p.ward;
    document.getElementById("pDept").textContent = p.department;
    document.getElementById("pTpa").textContent = p.tpa;

    noteInput.value = p.note || "";
    updateCharCount();
    updateBackdrop();
    document.getElementById("noteDirtyFlag").hidden = true;

    if (state.hasRunOnce[p.id] && state.lastResultByPatient[p.id]) {
      renderResults(state.lastResultByPatient[p.id], p, false);
    } else if (autoRun) {
      runEngine(false);
    } else {
      showEmptyResults();
    }
  }

  function showEmptyResults() {
    document.getElementById("resultsEmpty").hidden = false;
    document.getElementById("resultsBody").hidden = true;
    document.getElementById("summaryCard").hidden = true;
    document.getElementById("runStatus").textContent = "Not yet run for this patient.";
  }

  /* ---------------- note editor / entity linker ---------------- */
  const noteInput = document.getElementById("noteInput");
  const noteBackdrop = document.getElementById("noteBackdrop");
  const linkerToggle = document.getElementById("linkerToggle");

  function updateBackdrop() {
    const text = noteInput.value;
    if (linkerToggle.checked && state.keywords.length) {
      const matches = findMatches(text, state.keywords);
      noteBackdrop.innerHTML = buildHighlightHTML(text, matches);
    } else {
      noteBackdrop.innerHTML = escapeHtml(text) + "\n";
    }
    noteBackdrop.scrollTop = noteInput.scrollTop;
    noteBackdrop.scrollLeft = noteInput.scrollLeft;
  }
  function updateCharCount() {
    document.getElementById("noteCharCount").textContent = noteInput.value.length + " characters";
  }
  noteInput.addEventListener("input", function () {
    updateBackdrop();
    updateCharCount();
    const p = getPatient(state.selectedPatientId);
    if (p && state.hasRunOnce[p.id]) document.getElementById("noteDirtyFlag").hidden = false;
  });
  noteInput.addEventListener("scroll", function () {
    noteBackdrop.scrollTop = noteInput.scrollTop;
    noteBackdrop.scrollLeft = noteInput.scrollLeft;
  });
  linkerToggle.addEventListener("change", updateBackdrop);

  noteBackdrop.addEventListener("mouseover", function (e) {
    if (e.target.tagName === "MARK") {
      e.target.style.background = "rgba(47,208,217,0.5)";
      const card = document.querySelector('.code-card[data-entity="' + e.target.dataset.entity + '"]');
      if (card) { card.classList.add("traced"); card.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
    }
  });
  noteBackdrop.addEventListener("mouseout", function (e) {
    if (e.target.tagName === "MARK") {
      e.target.style.background = "";
      const card = document.querySelector('.code-card[data-entity="' + e.target.dataset.entity + '"]');
      if (card) card.classList.remove("traced");
    }
  });

  /* ---------------- run engine (calls the backend) ---------------- */
  const runBtn = document.getElementById("runEngineBtn");
  runBtn.addEventListener("click", () => runEngine(true));

  function runEngine(withSpinner) {
    const p = getPatient(state.selectedPatientId);
    if (!p) return;
    if (withSpinner) {
      runBtn.disabled = true;
      runBtn.classList.add("loading");
      setTimeout(() => doRun(p), 700);
    } else {
      doRun(p);
    }
  }

  function doRun(p) {
    const note = noteInput.value;
    api("/engine/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId: p.id, note })
    })
      .then((data) => {
        p.note = note;
        state.lastResultByPatient[p.id] = data.result;
        state.hasRunOnce[p.id] = true;
        document.getElementById("noteDirtyFlag").hidden = true;
        renderResults(data.result, p, true);
        updateStatsEverywhere(data.stats);
        runBtn.disabled = false;
        runBtn.classList.remove("loading");
        document.getElementById("runStatus").textContent = "Last run: just now · " + data.result.entities.length + " entities detected.";
        toast("Dual Engine complete — " + data.result.entities.length + " billable " + (data.result.entities.length === 1 ? "entity" : "entities") + " detected.", "success");
      })
      .catch((err) => {
        runBtn.disabled = false;
        runBtn.classList.remove("loading");
        toast("Engine run failed: " + err.message, "warning");
      });
  }

  /* ---------------- render results (server already computed everything) --- */
  function renderResults(result, p) {
    document.getElementById("resultsEmpty").hidden = true;
    document.getElementById("resultsBody").hidden = false;
    document.getElementById("summaryCard").hidden = false;

    renderConfidence(result.confidencePct);
    renderRevenue(result.identifiedRevenue, result.entities.length);
    renderCompliance(result.complianceAlerts);
    renderCodeCards(result.entities, p);
    document.getElementById("summaryText").textContent = result.summary;
    renderJargon(result.entities);
    renderAftercare(result.entities);
    renderFinancials(result.financials);
  }

  function renderConfidence(pct) {
    const circumference = 2 * Math.PI * 55;
    const ring = document.getElementById("ringProgress");
    ring.style.strokeDasharray = circumference;
    ring.style.strokeDashoffset = circumference * (1 - pct / 100);
    animateNumber(document.getElementById("ringPct"), 0, pct, 900, (v) => v.toFixed(1) + "%");
    document.getElementById("ringCaption").textContent =
      pct > 90 ? "AI Confidence · HITL Verification Required" : "Low Confidence · Manual Coding Recommended";
  }

  function renderRevenue(total, count) {
    animateNumber(document.getElementById("revenueVal"), 0, total, 900, (v) => inr(v));
    document.getElementById("revenueSub").textContent = "Across " + count + " billable " + (count === 1 ? "entity" : "entities") + " detected in this note";
  }

  function renderCompliance(alerts) {
    const icons = { warning: "⚠️", critical: "🚫", good: "✅", info: "ℹ️" };
    document.getElementById("complianceBox").innerHTML = alerts.map((a) =>
      '<div class="alert-row ' + a.level + '"><span class="alert-icon">' + icons[a.level] + "</span><span>" + escapeHtml(a.text) + "</span></div>"
    ).join("");
  }

  function renderCodeCards(entities, p) {
    const grid = document.getElementById("codeGrid");
    document.getElementById("codesCount").textContent = entities.length + " code" + (entities.length === 1 ? "" : "s");
    if (entities.length === 0) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:30px;"><div class="ee-icon">🔍</div><p>No codes extracted from this note yet.</p></div>';
    } else {
      grid.innerHTML = entities.map((en) => {
        const typeClass = en.codeType.toLowerCase().replace(/\s+/g, "-");
        const lineFee = en.fee * en.count;
        return '<div class="glass code-card" data-entity="' + en.id + '">' +
          '<div class="code-card-head">' +
            '<span class="code-type ' + typeClass + '">' + en.codeType + "</span>" +
            '<span class="code-tag">' + en.code + "</span>" +
            (en.count > 1 ? '<span class="code-count">×' + en.count + "</span>" : "") +
          "</div>" +
          '<p class="code-desc">' + escapeHtml(en.description) + "</p>" +
          '<div class="code-foot">' +
            '<span class="code-fee">' + inr(en.fee) + "</span>" +
            '<label class="approve-toggle"><input type="checkbox" class="approve-check" data-fee="' + lineFee + '" data-code="' + en.code + '"><span>Approve Code</span></label>' +
          "</div>" +
        "</div>";
      }).join("");
    }
    const identified = entities.reduce((s, e) => s + e.fee * e.count, 0);
    document.getElementById("identifiedAmt").textContent = inr(identified);
    updateApprovedTotal();
    grid.querySelectorAll(".approve-check").forEach((cb) => {
      cb.addEventListener("change", function () {
        this.closest(".approve-toggle").classList.toggle("checked", this.checked);
        updateApprovedTotal();
        if (this.checked) {
          const fee = parseFloat(this.dataset.fee);
          api("/audit/approve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ patientId: p.id, code: this.dataset.code, fee })
          })
            .then((data) => {
              updateStatsEverywhere(data.stats);
              toast("Code " + this.dataset.code + " approved for billing.", "success");
            })
            .catch((err) => toast("Could not log approval: " + err.message, "warning"));
        }
      });
    });
  }
  function updateApprovedTotal() {
    let sum = 0;
    document.querySelectorAll(".approve-check:checked").forEach((cb) => (sum += parseFloat(cb.dataset.fee)));
    document.getElementById("approvedAmt").textContent = inr(sum);
  }

  function renderJargon(entities) {
    const list = document.getElementById("jargonList");
    if (entities.length === 0) {
      list.innerHTML = '<div class="empty-state" style="padding:24px;"><p>Nothing to translate yet — run the engine first.</p></div>';
      return;
    }
    list.innerHTML = entities.map((en) =>
      '<div class="jargon-row">' +
        '<div class="jargon-term"><span class="term-tag">' + en.codeType + " " + en.code + '</span><strong>' + escapeHtml(capitalize(en.label)) + "</strong></div>" +
        '<div class="jargon-arrow">→</div>' +
        '<div class="jargon-plain">' + escapeHtml(en.jargon) + "</div>" +
      "</div>"
    ).join("");
  }

  function renderAftercare(entities) {
    const ul = document.getElementById("aftercareList");
    const items = [], seen = new Set();
    entities.forEach((e) => { if (!seen.has(e.afterCare)) { seen.add(e.afterCare); items.push(e.afterCare); } });
    items.push("Follow up with your consultant as advised.");
    items.push("Carry your UHID and insurance card for all future visits.");
    ul.innerHTML = items.map((txt, i) => '<li><input type="checkbox" id="ac' + i + '"><label for="ac' + i + '">' + escapeHtml(txt) + "</label></li>").join("");
    ul.querySelectorAll("input").forEach((cb) => cb.addEventListener("change", function () { this.closest("li").classList.toggle("done", this.checked); }));
  }

  function renderFinancials(fin) {
    document.getElementById("finTotal").textContent = inr(fin.total);
    document.getElementById("finTpaLabel").textContent = fin.tpa + " Approval";
    document.getElementById("finApproved").textContent = inr(fin.approved);
    document.getElementById("finCopay").textContent = inr(fin.copay);
    const coveredPct = fin.total > 0 ? (fin.approved / fin.total) * 100 : 0;
    const copayPct = fin.total > 0 ? (fin.copay / fin.total) * 100 : 0;
    document.getElementById("finBarCovered").style.width = coveredPct + "%";
    document.getElementById("finBarCopay").style.width = copayPct + "%";
  }

  /* ---------------- tabs ---------------- */
  document.querySelectorAll(".tabbtn").forEach((btn) => {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".tabbtn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tabpanel").forEach((p) => p.classList.remove("active"));
      this.classList.add("active");
      document.getElementById("tab-" + this.dataset.tab).classList.add("active");
    });
  });

  /* ---------------- action buttons ---------------- */
  document.getElementById("btnPdf").addEventListener("click", function () {
    const p = getPatient(state.selectedPatientId);
    const result = state.lastResultByPatient[p.id];
    if (!result) { toast("Run the engine first.", "warning"); return; }
    const fin = result.financials;
    const now = new Date();
    openModal(
      '<div class="doc-header"><div><div class="doc-title">ABDM-Compliant Care Summary</div><div style="font-size:11.5px;color:var(--text-muted);margin-top:3px;">Generated ' + now.toLocaleString("en-IN") + '</div></div><span class="doc-badge">FHIR R4</span></div>' +
      '<div class="doc-grid">' +
        '<div class="k">Patient</div><div class="v">' + escapeHtml(p.name) + "</div>" +
        '<div class="k">UHID / ABHA-linked ID</div><div class="v">' + p.uhid + "</div>" +
        '<div class="k">Consultant</div><div class="v">' + escapeHtml(p.consultant) + "</div>" +
        '<div class="k">Department</div><div class="v">' + escapeHtml(p.department) + "</div>" +
      "</div>" +
      '<div class="panel-title" style="margin-bottom:8px;">Billed Codes</div>' +
      result.entities.map((e) => '<div class="doc-line"><span>' + e.codeType + " " + e.code + " — " + escapeHtml(e.description) + "</span><span>" + inr(e.fee * e.count) + "</span></div>").join("") +
      '<div class="doc-line" style="border-bottom:none;font-weight:700;margin-top:6px;"><span>Total Charge</span><span>' + inr(fin.total) + "</span></div>" +
      '<div class="doc-line" style="border-bottom:none;color:var(--good);"><span>' + fin.tpa + " Approved</span><span>" + inr(fin.approved) + "</span></div>" +
      '<div class="doc-line" style="border-bottom:none;color:var(--rose);"><span>Patient Copay</span><span>' + inr(fin.copay) + "</span></div>" +
      '<div class="doc-note">This is a demo preview inside the Automedi 360 hackathon prototype. In production this view is exported as a signed, ABDM-compliant FHIR R4 PDF bundle.</div>'
    );
  });

  document.getElementById("btnWhatsapp").addEventListener("click", function () {
    const p = getPatient(state.selectedPatientId);
    toast("Care plan sent to " + (p.phone || "the patient") + " via WhatsApp (simulated).", "info");
  });

  /* ---------------- register page ---------------- */
  const wardHints = {
    IPD: 'IPD tip: use the format "Room ___" or "ICU Bed ___".',
    OPD: 'OPD tip: use the format "OPD Token #___".',
    ER: 'ER tip: use the format "ER Triage Bay ___".'
  };
  document.querySelectorAll("input[name=fWard]").forEach((r) => {
    r.addEventListener("change", function () { document.getElementById("locationHint").textContent = wardHints[this.value]; });
  });

  document.getElementById("registerForm").addEventListener("submit", function (e) {
    e.preventDefault();
    const payload = {
      name: document.getElementById("fName").value.trim(),
      age: document.getElementById("fAge").value,
      gender: document.getElementById("fGender").value,
      bloodGroup: document.getElementById("fBlood").value,
      ward: document.querySelector("input[name=fWard]:checked").value,
      location: document.getElementById("fLocation").value.trim(),
      department: document.getElementById("fDept").value,
      consultant: document.getElementById("fConsultant").value.trim(),
      tpa: document.getElementById("fTpa").value,
      phone: document.getElementById("fPhone").value.trim(),
      note: document.getElementById("fNote").value.trim()
    };
    api("/patients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then((patient) => {
        state.patients.push(patient);
        renderRosterSelect();
        renderRosterTable();
        refreshHomeStats();
        this.reset();
        document.getElementById("locationHint").textContent = wardHints.IPD;
        toast("✅ " + patient.name + " added to the roster (" + patient.uhid + ").", "success");
      })
      .catch((err) => toast(err.message, "warning"));
  });

  function refreshRosterPage() {
    api("/patients").then((patients) => {
      state.patients = patients;
      renderRosterSelect();
      renderRosterTable();
    }).catch((err) => toast("Could not load roster: " + err.message, "warning"));
  }

  function renderRosterTable() {
    const tbody = document.getElementById("rosterTableBody");
    document.getElementById("rosterCount").textContent = state.patients.length + " patients";
    tbody.innerHTML = state.patients.map((p) =>
      "<tr>" +
        '<td class="mono">' + p.uhid + "</td>" +
        "<td>" + escapeHtml(p.name) + ' <span class="ward-pill ' + p.ward + '">' + p.ward + "</span></td>" +
        "<td>" + escapeHtml(p.location) + "</td>" +
        "<td>" + escapeHtml(p.department) + "</td>" +
        "<td>" + escapeHtml(p.tpa) + "</td>" +
        '<td><div class="row-actions">' +
          '<button class="icon-btn" data-open="' + p.id + '">Open →</button>' +
          (!p.protected ? '<button class="icon-btn danger" data-remove="' + p.id + '">Remove</button>' : "") +
        "</div></td>" +
      "</tr>"
    ).join("");
    tbody.querySelectorAll("[data-open]").forEach((btn) => {
      btn.addEventListener("click", function () {
        state.selectedPatientId = this.dataset.open;
        renderRosterSelect();
        loadPatientIntoWorkspace(true);
        navigate("workspace");
      });
    });
    tbody.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", function () {
        const id = this.dataset.remove;
        api("/patients/" + id, { method: "DELETE" })
          .then(() => {
            state.patients = state.patients.filter((p) => p.id !== id);
            renderRosterSelect();
            renderRosterTable();
            refreshHomeStats();
            toast("Patient removed from roster.", "info");
          })
          .catch((err) => toast(err.message, "warning"));
      });
    });
  }

  /* ---------------- analytics page ---------------- */
  function refreshAnalyticsPage() {
    Promise.all([api("/stats"), api("/audit?limit=25")])
      .then(([stats, audit]) => renderAnalytics(stats, audit))
      .catch((err) => toast("Could not load analytics: " + err.message, "warning"));
  }

  function renderAnalytics(stats, audit) {
    document.getElementById("anPatients").textContent = stats.patientsCount;
    document.getElementById("anRevenue").textContent = inr(stats.cumulativeRevenue);
    document.getElementById("anApproved").textContent = stats.cumulativeApproved;
    document.getElementById("anAlerts").textContent = stats.complianceAlertsLogged;

    const deptColors = ["#2fd0d9", "#8b7cf6", "#e8b563", "#e8708a", "#33c07e"];
    const entries = Object.entries(stats.deptTotals || {}).sort((a, b) => b[1] - a[1]);
    const max = entries.length ? entries[0][1] : 1;
    const barsEl = document.getElementById("deptBars");
    if (entries.length === 0) {
      barsEl.innerHTML = '<div class="empty-state" style="padding:30px;"><p>Run the engine in Workspace to see department revenue here.</p></div>';
    } else {
      barsEl.innerHTML = entries.map((e, i) =>
        '<div class="bar-row">' +
          '<span class="bar-label">' + escapeHtml(e[0]) + "</span>" +
          '<div class="bar-track"><div class="bar-fill" style="width:' + (e[1] / max * 100) + "%;background:" + deptColors[i % deptColors.length] + ';"></div></div>' +
          '<span class="bar-val">' + inr(e[1]) + "</span>" +
        "</div>"
      ).join("");
    }

    const tbody = document.getElementById("auditTableBody");
    tbody.innerHTML = audit.map((a) =>
      "<tr>" +
        '<td class="mono">' + escapeHtml(fmtTime(a.time)) + "</td>" +
        "<td>" + escapeHtml(a.patient) + "</td>" +
        "<td>" + escapeHtml(a.action) + "</td>" +
        '<td class="mono">' + inr(a.amount) + "</td>" +
        '<td><span class="status-pill ' + a.status + '">' + (a.status === "approved" ? "Approved" : "Run") + "</span></td>" +
      "</tr>"
    ).join("");
  }

  /* ---------------- home stats ---------------- */
  function refreshHomeStats() {
    api("/stats").then((stats) => updateStatsEverywhere(stats)).catch(() => {});
  }
  function updateStatsEverywhere(stats) {
    document.getElementById("statPatients").textContent = stats.patientsCount;
    document.getElementById("statRevenue").textContent = inr(stats.cumulativeRevenue);
    document.getElementById("statCodes").textContent = stats.cumulativeCodes;
    document.getElementById("statConfidence").textContent = "98.8%";
  }

  /* ---------------- hero live demo (purely decorative, no API calls) ------ */
  const HERO_SCRIPT = "Patient reports retrosternal chest pain. Ordered 12-lead ECG and Troponin I. Administered sublingual Nitroglycerin...";
  function runHeroDemo() {
    const noteEl = document.getElementById("heroTypewriter");
    const chipsEl = document.getElementById("heroChips");
    const revEl = document.getElementById("heroRevenue");
    let i = 0;
    noteEl.innerHTML = ""; chipsEl.innerHTML = ""; revEl.textContent = "₹0";
    const chipsData = [
      { label: "ICD-10 · R07.9", cls: "icd", at: 38, fee: 500 },
      { label: "CPT · 93000", cls: "cpt", at: 63, fee: 800 },
      { label: "CPT · 84484", cls: "cpt", at: 88, fee: 1200 },
      { label: "HCPCS · J3490", cls: "icd", at: 135, fee: 150 }
    ];
    let chipIdx = 0, revenue = 0;
    function typeStep() {
      if (i <= HERO_SCRIPT.length) {
        noteEl.textContent = HERO_SCRIPT.slice(0, i);
        noteEl.innerHTML += '<span class="demo-caret"></span>';
        while (chipIdx < chipsData.length && i >= chipsData[chipIdx].at) {
          const c = chipsData[chipIdx];
          const chip = document.createElement("span");
          chip.className = "demo-chip " + c.cls;
          chip.textContent = c.label;
          chipsEl.appendChild(chip);
          revenue += c.fee;
          animateNumber(revEl, revenue - c.fee, revenue, 500, (v) => inr(v));
          chipIdx++;
        }
        i++;
        setTimeout(typeStep, 26);
      } else {
        setTimeout(runHeroDemo, 3200);
      }
    }
    typeStep();
  }

  /* ---------------- clock + latency (decorative) ---------------- */
  function tickClock() {
    document.getElementById("liveClock").textContent = new Date().toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", day: "2-digit", month: "short" });
  }
  setInterval(tickClock, 1000); tickClock();
  setInterval(() => { document.getElementById("apiLatency").textContent = 18 + Math.floor(Math.random() * 15); }, 2600);

  /* ---------------- init ---------------- */
  Promise.all([api("/patients"), api("/keywords")])
    .then(([patients, keywords]) => {
      state.patients = patients;
      state.keywords = keywords;
      state.selectedPatientId = (patients.find((p) => p.id === "p1") || patients[0] || {}).id;
      renderRosterSelect();
      renderRosterTable();
      if (state.selectedPatientId) loadPatientIntoWorkspace(true);
      refreshHomeStats();
      navigate(PAGES.indexOf(location.hash.slice(1)) !== -1 ? location.hash.slice(1) : "home");
    })
    .catch((err) => {
      toast("Could not reach the Automedi 360 API — is the backend running? (" + err.message + ")", "warning");
      navigate("home");
    });

  runHeroDemo();
})();
