/* FLASH Intelligence Console */
document.addEventListener("DOMContentLoaded", function () {
  var activePanel = "rag";
  var token =
    new URLSearchParams(window.location.search).get("token") ||
    localStorage.getItem("flash_token") ||
    "";
  var activeCol = "";
  var cachedDocs = [];

  if (token) localStorage.setItem("flash_token", token);
  var tokenInput = document.getElementById("tokenInput");
  if (tokenInput) tokenInput.value = token;

  /* ── Theme ── */
  var theme = localStorage.getItem("flash_theme") || "dark";
  document.documentElement.setAttribute("data-theme", theme);

  document.getElementById("themeToggle").addEventListener("click", function () {
    theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("flash_theme", theme);
  });

  /* ── Toast ── */
  function toast(msg, type) {
    var host = document.getElementById("toastHost");
    var el = document.createElement("div");
    el.className = "toast" + (type ? " " + type : "");
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(function () {
      el.style.opacity = "0";
      el.style.transition = "opacity 0.2s";
      setTimeout(function () { el.remove(); }, 200);
    }, 3200);
  }

  function saveToken() {
    token = tokenInput.value;
    localStorage.setItem("flash_token", token);
    toast("Token saved", "success");
  }
  window.saveToken = saveToken;

  function headers() {
    var h = { "Content-Type": "application/json" };
    if (token) h["x-flash-token"] = token;
    return h;
  }

  async function api(path, opts) {
    var res = await fetch(path, Object.assign({ headers: headers() }, opts || {}));
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  function setLoading(btn, loading) {
    if (!btn) return;
    btn.disabled = loading;
    if (loading) {
      btn._label = btn.innerHTML;
      btn.innerHTML = '<span class="spinner"></span> Working…';
    } else if (btn._label) {
      btn.innerHTML = btn._label;
    }
  }

  function showPanel(id) {
    activePanel = id;
    document.querySelectorAll(".nav-item").forEach(function (el) {
      el.classList.toggle("active", el.dataset.panel === id);
    });
    document.querySelectorAll(".panel").forEach(function (el) {
      el.classList.toggle("active", el.id === "panel-" + id);
    });
    if (id === "data") loadDataExplorer();
  }

  document.querySelectorAll(".nav-item").forEach(function (btn) {
    btn.addEventListener("click", function () {
      showPanel(btn.dataset.panel);
    });
  });

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderSources(container, sources, textKey) {
    container.innerHTML = "";
    if (!sources || !sources.length) return;
    sources.forEach(function (s) {
      var div = document.createElement("div");
      div.className = "list-item";
      var text = s.text || s.content || "";
      var score = s.score != null ? s.score.toFixed(3) : "—";
      div.innerHTML =
        '<div class="list-item-content">' +
        "<pre>" + escapeHtml(text.slice(0, 500)) + (text.length > 500 ? "…" : "") + "</pre>" +
        '<div class="list-item-meta">Relevance <span class="source-score">' + score + "</span></div>" +
        "</div>";
      container.appendChild(div);
    });
  }

  /* ── Private RAG ── */
  document.getElementById("ragIngestBtn").addEventListener("click", async function () {
    var btn = this;
    var out = document.getElementById("ragIngestResult");
    out.classList.remove("empty-state");
    out.textContent = "Ingesting…";
    setLoading(btn, true);
    try {
      var data = await api("/api/intelligence/rag/ingest", {
        method: "POST",
        body: JSON.stringify({
          collection: document.getElementById("ragCollection").value || "knowledge",
          title: document.getElementById("ragTitle").value,
          text: document.getElementById("ragText").value,
        }),
      });
      out.textContent = JSON.stringify(data, null, 2);
      toast("Indexed " + data.chunks + " chunk(s)", "success");
    } catch (e) {
      out.textContent = e.message;
      toast(e.message, "error");
    } finally {
      setLoading(btn, false);
    }
  });

  document.getElementById("ragAskBtn").addEventListener("click", async function () {
    var btn = this;
    var out = document.getElementById("ragAskResult");
    var sources = document.getElementById("ragSources");
    out.classList.remove("empty-state");
    out.textContent = "Searching…";
    sources.innerHTML = "";
    setLoading(btn, true);
    try {
      var data = await api("/api/intelligence/rag/ask", {
        method: "POST",
        body: JSON.stringify({
          collection: document.getElementById("ragCollection").value || "knowledge",
          question: document.getElementById("ragQuestion").value,
        }),
      });
      out.textContent =
        data.contextPack ||
        "No matching context — ingest documents first.";
      renderSources(sources, data.sources);
    } catch (e) {
      out.textContent = e.message;
      toast(e.message, "error");
    } finally {
      setLoading(btn, false);
    }
  });

  /* ── Agent Memory ── */
  document.getElementById("memRememberBtn").addEventListener("click", async function () {
    var btn = this;
    var out = document.getElementById("memResult");
    setLoading(btn, true);
    try {
      var data = await api("/api/intelligence/memory/remember", {
        method: "POST",
        body: JSON.stringify({
          namespace: document.getElementById("memNamespace").value || "default",
          content: document.getElementById("memContent").value,
          importance: Number(document.getElementById("memImportance").value) || 1,
        }),
      });
      out.classList.remove("empty-state");
      out.textContent = JSON.stringify(data, null, 2);
      document.getElementById("memContent").value = "";
      toast("Memory saved", "success");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(btn, false);
    }
  });

  document.getElementById("memRecallBtn").addEventListener("click", async function () {
    var btn = this;
    var list = document.getElementById("memRecallList");
    list.innerHTML = '<div class="empty">Recalling…</div>';
    setLoading(btn, true);
    try {
      var data = await api("/api/intelligence/memory/recall", {
        method: "POST",
        body: JSON.stringify({
          namespace: document.getElementById("memNamespace").value || "default",
          query: document.getElementById("memQuery").value,
        }),
      });
      list.innerHTML = "";
      if (!data.results || !data.results.length) {
        list.innerHTML = '<div class="empty">No memories matched this query.</div>';
        return;
      }
      data.results.forEach(function (m) {
        var div = document.createElement("div");
        div.className = "list-item";
        div.innerHTML =
          '<div class="list-item-content">' +
          "<pre>" + escapeHtml(m.content) + "</pre>" +
          '<div class="list-item-meta">Score <span class="source-score">' +
          (m.score != null ? m.score.toFixed(3) : "—") +
          "</span></div></div>" +
          '<button class="btn btn-danger btn-sm mem-forget" data-id="' +
          escapeHtml(String(m.memoryId)) +
          '">Forget</button>';
        list.appendChild(div);
      });
      list.querySelectorAll(".mem-forget").forEach(function (b) {
        b.onclick = function () { forgetMemory(b.getAttribute("data-id")); };
      });
    } catch (e) {
      list.innerHTML = '<div class="empty" style="color:var(--danger)">' + escapeHtml(e.message) + "</div>";
    } finally {
      setLoading(btn, false);
    }
  });

  async function forgetMemory(id) {
    var ns = document.getElementById("memNamespace").value || "default";
    await api(
      "/api/intelligence/memory/" + encodeURIComponent(ns) + "/" + encodeURIComponent(id),
      { method: "DELETE" },
    );
    toast("Memory removed", "success");
    document.getElementById("memRecallBtn").click();
  }

  /* ── Sealed Vault ── */
  async function refreshVaultStatus() {
    var name = document.getElementById("vaultName").value || "default";
    try {
      var data = await api("/api/intelligence/vault/status?vaultName=" + encodeURIComponent(name));
      var badge = document.getElementById("vaultStatusBadge");
      badge.textContent = data.locked ? "Locked" : "Unlocked";
      badge.className = "badge " + (data.locked ? "badge-muted" : "badge-success");
      document.getElementById("vaultRecordsPanel").style.display = data.locked ? "none" : "block";
      if (!data.locked) loadVaultRecords();
    } catch (e) {
      document.getElementById("vaultStatusBadge").textContent = "Error";
    }
  }

  document.getElementById("vaultUnlockBtn").addEventListener("click", async function () {
    var btn = this;
    setLoading(btn, true);
    try {
      await api("/api/intelligence/vault/unlock", {
        method: "POST",
        body: JSON.stringify({
          vaultName: document.getElementById("vaultName").value || "default",
          passphrase: document.getElementById("vaultPassphrase").value,
        }),
      });
      document.getElementById("vaultPassphrase").value = "";
      toast("Vault unlocked", "success");
      refreshVaultStatus();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(btn, false);
    }
  });

  document.getElementById("vaultLockBtn").addEventListener("click", async function () {
    await api("/api/intelligence/vault/lock", {
      method: "POST",
      body: JSON.stringify({ vaultName: document.getElementById("vaultName").value || "default" }),
    });
    toast("Vault locked", "success");
    refreshVaultStatus();
  });

  async function loadVaultRecords() {
    var list = document.getElementById("vaultRecordList");
    list.innerHTML = '<div class="empty">Loading…</div>';
    try {
      var name = document.getElementById("vaultName").value || "default";
      var data = await api("/api/intelligence/vault/list?vaultName=" + encodeURIComponent(name));
      list.innerHTML = "";
      if (!data.records || !data.records.length) {
        list.innerHTML = '<div class="empty">No records stored yet.</div>';
        return;
      }
      data.records.forEach(function (r) {
        var div = document.createElement("div");
        div.className = "list-item";
        div.innerHTML =
          '<div class="list-item-content"><pre>' +
          escapeHtml(JSON.stringify(r, null, 2)) +
          '</pre></div><button class="btn btn-danger btn-sm vault-del" data-id="' +
          escapeHtml(String(r._id)) +
          '">Remove</button>';
        list.appendChild(div);
      });
      list.querySelectorAll(".vault-del").forEach(function (b) {
        b.onclick = async function () {
          var vname = document.getElementById("vaultName").value || "default";
          await api(
            "/api/intelligence/vault/" + encodeURIComponent(vname) + "/" + encodeURIComponent(b.getAttribute("data-id")),
            { method: "DELETE" },
          );
          toast("Record removed", "success");
          loadVaultRecords();
        };
      });
    } catch (e) {
      list.innerHTML = '<div class="empty" style="color:var(--danger)">' + escapeHtml(e.message) + "</div>";
    }
  }

  document.getElementById("vaultPutBtn").addEventListener("click", async function () {
    var btn = this;
    setLoading(btn, true);
    try {
      var payload = JSON.parse(document.getElementById("vaultPayload").value || "{}");
      await api("/api/intelligence/vault/put", {
        method: "POST",
        body: JSON.stringify({
          vaultName: document.getElementById("vaultName").value || "default",
          recordId: document.getElementById("vaultRecordId").value,
          payload: payload,
        }),
      });
      document.getElementById("vaultPayload").value = "{}";
      toast("Record stored", "success");
      loadVaultRecords();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(btn, false);
    }
  });

  /* ── Trust ── */
  document.getElementById("proofBtn").addEventListener("click", async function () {
    var btn = this;
    var out = document.getElementById("proofResult");
    setLoading(btn, true);
    out.classList.remove("empty-state");
    out.textContent = "Generating…";
    try {
      var data = await api("/api/intelligence/proof", {
        method: "POST",
        body: JSON.stringify({
          collection: document.getElementById("proofCollection").value,
          actor: "intelligence-console",
        }),
      });
      out.textContent = JSON.stringify(data.proof, null, 2);
      toast("Proof generated", "success");
    } catch (e) {
      out.textContent = e.message;
      toast(e.message, "error");
    } finally {
      setLoading(btn, false);
    }
  });

  document.getElementById("firewallBtn").addEventListener("click", async function () {
    var btn = this;
    var out = document.getElementById("firewallResult");
    setLoading(btn, true);
    out.classList.remove("empty-state");
    out.textContent = "Scanning…";
    try {
      var data = await api("/api/intelligence/firewall/scan", {
        method: "POST",
        body: JSON.stringify({ text: document.getElementById("firewallText").value }),
      });
      out.textContent = JSON.stringify(data, null, 2);
      toast(data.safe ? "No violations found" : data.violations.length + " violation(s)", data.safe ? "success" : "error");
    } catch (e) {
      out.textContent = e.message;
      toast(e.message, "error");
    } finally {
      setLoading(btn, false);
    }
  });

  /* ── Data Explorer ── */
  async function loadDataExplorer() {
    try {
      var stats = await api("/api/stats");
      var list = document.getElementById("dataColList");
      list.innerHTML = "";
      (stats.collections || []).forEach(function (c, i) {
        if (i === 0 && !activeCol) activeCol = c.name;
        var div = document.createElement("div");
        div.className = "col-chip" + (activeCol === c.name ? " active" : "");
        div.innerHTML =
          "<span>" + escapeHtml(c.name) + '</span><span class="badge badge-muted">' + c.count + "</span>";
        div.onclick = function () {
          activeCol = c.name;
          loadDataExplorer();
        };
        list.appendChild(div);
      });
      var label = document.getElementById("dataColLabel");
      if (label) label.textContent = activeCol ? "Collection: " + activeCol : "Select a collection";
      if (activeCol) await loadDocs();
    } catch (e) {
      document.getElementById("dataDocs").innerHTML =
        '<div class="empty" style="color:var(--danger)">Failed to load collections.</div>';
    }
  }

  async function loadDocs() {
    var box = document.getElementById("dataDocs");
    box.innerHTML = '<div class="empty">Loading…</div>';
    try {
      cachedDocs = await api("/api/docs/" + encodeURIComponent(activeCol));
      box.innerHTML = "";
      if (!cachedDocs.length) {
        box.innerHTML = '<div class="empty">No documents in this collection.</div>';
        return;
      }
      cachedDocs.forEach(function (doc) {
        var div = document.createElement("div");
        div.className = "list-item";
        div.innerHTML =
          '<div class="list-item-content"><pre>' +
          escapeHtml(JSON.stringify(doc, null, 2)) +
          "</pre></div>";
        box.appendChild(div);
      });
    } catch (e) {
      box.innerHTML = '<div class="empty" style="color:var(--danger)">' + escapeHtml(e.message) + "</div>";
    }
  }

  document.getElementById("dataInsertBtn").addEventListener("click", async function () {
    if (!activeCol) return toast("Select a collection first", "error");
    var btn = this;
    setLoading(btn, true);
    try {
      var payload = JSON.parse(document.getElementById("dataInsertJson").value);
      await api("/api/docs/" + encodeURIComponent(activeCol), {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast("Document inserted", "success");
      loadDataExplorer();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(btn, false);
    }
  });

  refreshVaultStatus();
  showPanel("rag");
});
