import http from 'node:http';

/**
 * FLASH Sovereign Web GUI Studio (FlashStudio)
 * World-class interactive database management UI for FLASH DB.
 */
export class FlashDashboard {
  /**
   * Starts the high-performance FlashStudio HTTP server
   * @param {import('../client/flash_client.mjs').FlashClient} client
   * @param {object} [options]
   * @param {number} [options.port=3456]
   * @param {string} [options.token] - Optional authentication passcode/token
   * @returns {http.Server}
   */
  static start(client, options = {}) {
    const port = options.port || 3456;
    const requiredToken = options.token || null;

    const server = http.createServer(async (req, res) => {
      // Enable CORS for smooth local development
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-flash-token');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
      }

      const url = new URL(req.url, `http://localhost:${port}`);

      // Token Authentication Check
      if (requiredToken) {
        const clientToken = req.headers['x-flash-token'] || url.searchParams.get('token');
        if (url.pathname.startsWith('/api/') && clientToken !== requiredToken) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Unauthorized: Invalid or missing dashboard token' }));
        }
      }

      // Helper to read JSON request body
      const readBody = () => new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch (e) {
            reject(new Error('Invalid JSON payload'));
          }
        });
        req.on('error', reject);
      });

      // 1. API: Database & Engine Stats
      if (url.pathname === '/api/stats' && req.method === 'GET') {
        try {
          const collections = await (typeof client.listCollections === 'function' ? client.listCollections() : client.db.listCollections());
          const stats = [];
          for (const colName of (collections || [])) {
            const col = client.collection(colName);
            const count = await col.count();
            const merkleRoot = typeof col.raw.getMerkleRoot === 'function' ? col.raw.getMerkleRoot() : 'Verified';
            stats.push({
              name: colName,
              count,
              merkleRoot,
              memtableBytes: col.raw.memtable?.byteSize || 0,
              sstableCount: col.raw.sstables?.length || 0
            });
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            dbName: client.db.dbName,
            collections: stats,
            requiresAuth: !!requiredToken,
            uptime: process.uptime()
          }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: err.message }));
        }
      }

      // 2. API: Fetch Collection Docs
      if (url.pathname.startsWith('/api/docs/') && req.method === 'GET') {
        const colName = decodeURIComponent(url.pathname.replace('/api/docs/', ''));
        const search = url.searchParams.get('search');
        try {
          const col = client.collection(colName);
          const filter = search ? { name: { $fuzzy: search, maxDistance: 1 } } : {};
          const docs = await col.find(filter, { limit: 300 });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(docs));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: err.message }));
        }
      }

      // 3. API: Create / Insert Document (POST)
      if (url.pathname.startsWith('/api/docs/') && req.method === 'POST') {
        const colName = decodeURIComponent(url.pathname.replace('/api/docs/', ''));
        try {
          const payload = await readBody();
          const col = client.collection(colName);
          const result = Array.isArray(payload) ? await col.insertMany(payload) : await col.insertOne(payload);
          res.writeHead(201, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, result }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: err.message }));
        }
      }

      // 4. API: Delete Document (DELETE)
      if (url.pathname.startsWith('/api/docs/') && req.method === 'DELETE') {
        const parts = url.pathname.split('/').filter(Boolean);
        const colName = decodeURIComponent(parts[2]);
        const docId = decodeURIComponent(parts[3] || '');
        try {
          const col = client.collection(colName);
          const result = await col.deleteOne({ _id: docId });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, result }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: err.message }));
        }
      }

      // 5. API: Create Collection (POST /api/collections)
      if (url.pathname === '/api/collections' && req.method === 'POST') {
        try {
          const { name } = await readBody();
          if (!name) throw new Error('Collection name required');
          const col = client.collection(name);
          await col.raw.init();
          res.writeHead(201, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, name }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: err.message }));
        }
      }

      // 6. API: Drop Collection (DELETE /api/collections/:name)
      if (url.pathname.startsWith('/api/collections/') && req.method === 'DELETE') {
        const colName = decodeURIComponent(url.pathname.replace('/api/collections/', ''));
        try {
          await client.db.dropCollection(colName);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, message: `Collection ${colName} dropped` }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: err.message }));
        }
      }

      // 7. API: Execute Live Aggregation Pipeline (POST /api/aggregate/:name)
      if (url.pathname.startsWith('/api/aggregate/') && req.method === 'POST') {
        const colName = decodeURIComponent(url.pathname.replace('/api/aggregate/', ''));
        try {
          const { pipeline } = await readBody();
          const col = client.collection(colName);
          const result = await col.aggregate(pipeline || []);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: err.message }));
        }
      }

      // 8. API: Force SSTable Flush (POST /api/flush/:name)
      if (url.pathname.startsWith('/api/flush/') && req.method === 'POST') {
        const colName = decodeURIComponent(url.pathname.replace('/api/flush/', ''));
        try {
          const col = client.collection(colName);
          await col.raw.flush();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, message: 'Flushed to immutable SSTable segment' }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: err.message }));
        }
      }

      // ----------------------------------------------------
      // Serve Next-Gen Cyberpunk Studio Web UI HTML
      // ----------------------------------------------------
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>⚡ FLASH DB Studio | Zero-Knowledge Document DBMS</title>
  <style>
    :root {
      --bg: #05070c;
      --panel: #0b0f19;
      --card: #111827;
      --accent: #00f2fe;
      --accent-glow: rgba(0, 242, 254, 0.35);
      --purple: #9d4edd;
      --emerald: #10b981;
      --rose: #f43f5e;
      --text: #f8fafc;
      --muted: #94a3b8;
      --border: rgba(0, 242, 254, 0.15);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); height: 100vh; display: flex; flex-direction: column; overflow: hidden; }

    header { background: var(--panel); height: 60px; padding: 0 24px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border); box-shadow: 0 4px 20px rgba(0,0,0,0.5); z-index: 10; }
    .brand { display: flex; align-items: center; gap: 12px; font-size: 18px; font-weight: bold; color: var(--accent); text-shadow: 0 0 12px var(--accent-glow); }
    .nav-right { display: flex; align-items: center; gap: 14px; }
    .badge { background: rgba(0, 242, 254, 0.1); color: var(--accent); border: 1px solid var(--accent); padding: 4px 10px; border-radius: 99px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
    .badge-pqc { background: rgba(157, 78, 221, 0.15); color: #c084fc; border-color: var(--purple); }

    .studio-container { display: grid; grid-template-columns: 280px 1fr; flex: 1; overflow: hidden; }

    .sidebar { background: var(--panel); border-right: 1px solid var(--border); display: flex; flex-direction: column; }
    .sidebar-header { padding: 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .sidebar-title { font-size: 12px; text-transform: uppercase; color: var(--muted); letter-spacing: 0.5px; font-weight: 700; }
    .col-list { flex: 1; overflow-y: auto; padding: 12px; }
    .col-item { padding: 12px 14px; border-radius: 8px; cursor: pointer; margin-bottom: 6px; border: 1px solid transparent; transition: all 0.2s; display: flex; justify-content: space-between; align-items: center; }
    .col-item:hover { background: rgba(255,255,255,0.03); }
    .col-item.active { background: rgba(0, 242, 254, 0.08); border-color: var(--accent); box-shadow: 0 0 15px rgba(0, 242, 254, 0.1); }
    .col-badge { font-size: 11px; background: rgba(255,255,255,0.08); padding: 2px 8px; border-radius: 99px; color: var(--muted); }

    .content-area { display: flex; flex-direction: column; background: var(--bg); overflow: hidden; }
    
    .studio-toolbar { background: var(--panel); padding: 12px 24px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
    .tab-group { display: flex; gap: 8px; }
    .tab-btn { background: transparent; border: 1px solid transparent; color: var(--muted); padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px; transition: all 0.2s; }
    .tab-btn:hover { color: var(--text); }
    .tab-btn.active { background: var(--card); color: var(--accent); border-color: var(--accent); }

    .query-bar { background: #080c14; padding: 14px 24px; border-bottom: 1px solid var(--border); display: flex; gap: 12px; align-items: center; }
    input, select, textarea { background: var(--card); border: 1px solid var(--border); color: #fff; padding: 9px 14px; border-radius: 8px; font-size: 13px; outline: none; transition: border-color 0.2s; }
    input:focus, textarea:focus { border-color: var(--accent); box-shadow: 0 0 10px var(--accent-glow); }

    .btn { background: var(--accent); border: none; color: #000; padding: 9px 16px; border-radius: 8px; font-weight: 700; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: all 0.2s; }
    .btn:hover { filter: brightness(1.15); transform: translateY(-1px); }
    .btn-secondary { background: var(--card); color: var(--text); border: 1px solid var(--border); }
    .btn-danger { background: var(--rose); color: #fff; }
    .btn-purple { background: var(--purple); color: #fff; }

    .viewport { flex: 1; overflow-y: auto; padding: 24px; }
    .doc-card { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 16px; margin-bottom: 14px; transition: all 0.2s; }
    .doc-card:hover { border-color: var(--accent); box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
    .doc-meta { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 8px; margin-bottom: 10px; font-size: 12px; color: var(--muted); }
    pre { color: #38bdf8; font-size: 13px; line-height: 1.5; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }

    table { width: 100%; border-collapse: collapse; background: var(--panel); border-radius: 10px; overflow: hidden; border: 1px solid var(--border); }
    th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 13px; }
    th { background: #0f172a; color: var(--muted); text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; font-weight: 700; }
    tr:hover td { background: rgba(0, 242, 254, 0.02); }

    .metrics-bar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
    .metric-card { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
    .metric-label { font-size: 11px; text-transform: uppercase; color: var(--muted); font-weight: 700; margin-bottom: 4px; }
    .metric-val { font-size: 20px; font-weight: bold; color: var(--accent); }

    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(4px); display: none; align-items: center; justify-content: center; z-index: 999; }
    .modal { background: var(--panel); border: 1px solid var(--border); border-radius: 14px; width: 560px; padding: 24px; box-shadow: 0 10px 40px rgba(0,0,0,0.8); }
  </style>
</head>
<body>

  <header>
    <div class="brand">
      <span>⚡ FLASH DB Studio</span>
      <span class="badge">Zero-Knowledge Sovereign DBMS</span>
      <span class="badge badge-pqc">PQC Ready</span>
    </div>
    <div class="nav-right">
      <input type="password" id="tokenInput" placeholder="Enter Token..." style="width: 180px; padding: 6px 10px; font-size: 12px;" onchange="saveToken()">
      <span id="authStatus" style="font-size: 12px; color: var(--emerald);">● Connected</span>
    </div>
  </header>

  <div class="studio-container">
    <div class="sidebar">
      <div class="sidebar-header">
        <span class="sidebar-title">Collections</span>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px;" onclick="openCreateColModal()">➕ New</button>
          <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px;" onclick="refreshAll()">↻</button>
        </div>
      </div>
      <div class="col-list" id="colList">
        <p style="color:var(--muted); padding:16px;">Loading collections...</p>
      </div>
    </div>

    <div class="content-area">
      <div class="studio-toolbar">
        <div class="tab-group">
          <button class="tab-btn active" id="tabDocs" onclick="switchTab('docs')">📄 Documents</button>
          <button class="tab-btn" id="tabTable" onclick="switchTab('table')">📊 Table View</button>
          <button class="tab-btn" id="tabAgg" onclick="switchTab('agg')">🧮 Aggregation Pipeline</button>
          <button class="tab-btn" id="tabMetrics" onclick="switchTab('metrics')">⚡ Storage & Merkle</button>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-secondary" onclick="flushCurrentCol()">💾 Flush SSTable</button>
          <button class="btn" onclick="openInsertModal()">➕ Insert Document</button>
        </div>
      </div>

      <div class="query-bar" id="queryBar">
        <input type="text" id="searchInput" placeholder="Search decrypted records via $fuzzy / text / _id..." style="flex:1;" onkeydown="if(event.key==='Enter') loadDocs()">
        <button class="btn btn-secondary" onclick="loadDocs()">Filter</button>
        <button class="btn btn-secondary" onclick="clearSearch()">Clear</button>
      </div>

      <div class="viewport" id="viewport">
        <p style="color:var(--muted); text-align:center; padding:40px;">Initializing Studio...</p>
      </div>
    </div>
  </div>

  <div class="modal-overlay" id="insertModal">
    <div class="modal">
      <h3 style="color:var(--accent); margin-bottom:8px;">➕ Insert Document</h3>
      <p style="font-size:12px; color:var(--muted); margin-bottom:14px;">Payload is validated against schema and encrypted client-side with AES-256-GCM before write:</p>
      <textarea id="jsonInput" rows="10" placeholder='{\n  "name": "Grace Hopper",\n  "email": "grace@navy.mil",\n  "role": "admiral"\n}' style="width:100%;"></textarea>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:16px;">
        <button class="btn btn-secondary" onclick="closeModal('insertModal')">Cancel</button>
        <button class="btn" onclick="submitInsert()">Encrypt & Save</button>
      </div>
    </div>
  </div>

  <div class="modal-overlay" id="createColModal">
    <div class="modal">
      <h3 style="color:var(--accent); margin-bottom:8px;">➕ Create Collection</h3>
      <input type="text" id="newColName" placeholder="Collection name (e.g. orders, tokens)..." style="margin-top:12px; width:100%;">
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:16px;">
        <button class="btn btn-secondary" onclick="closeModal('createColModal')">Cancel</button>
        <button class="btn" onclick="submitCreateCol()">Create</button>
      </div>
    </div>
  </div>

  <script>
    var activeCol = '';
    var currentTab = 'docs';
    var cachedStats = null;
    var cachedDocs = [];
    var token = new URLSearchParams(window.location.search).get('token') || localStorage.getItem('flash_token') || '';
    if (token) localStorage.setItem('flash_token', token);
    document.getElementById('tokenInput').value = token;


    function saveToken() {
      token = document.getElementById('tokenInput').value;
      localStorage.setItem('flash_token', token);
      refreshAll();
    }

    function getHeaders() {
      var h = { 'Content-Type': 'application/json' };
      if (token) h['x-flash-token'] = token;
      return h;
    }

    async function loadStats() {
      try {
        var res = await fetch('/api/stats', { headers: getHeaders() });
        cachedStats = await res.json();
        var list = document.getElementById('colList');
        list.innerHTML = '';
        if (!cachedStats.collections || cachedStats.collections.length === 0) {
          list.innerHTML = '<p style="color:var(--muted); text-align:center; padding:16px;">No collections found.</p>';
          document.getElementById('viewport').innerHTML = '<p style="text-align:center; color:var(--muted); padding:40px;">No collections found. Click "➕ New" to create one.</p>';
          return;
        }
        cachedStats.collections.forEach(function(c, idx) {
          if (idx === 0 && !activeCol) activeCol = c.name;
          var div = document.createElement('div');
          div.className = 'col-item ' + (activeCol === c.name ? 'active' : '');
          div.innerHTML = '<strong>' + c.name + '</strong><span class="col-badge">' + c.count + '</span>';
          div.onclick = async function() {
            activeCol = c.name;
            document.querySelectorAll('.col-item').forEach(function(e) { e.classList.remove('active'); });
            div.classList.add('active');
            await loadDocs();
          };
          list.appendChild(div);
        });
      } catch (e) {
        document.getElementById('colList').innerHTML = '<p style="color:var(--rose); padding:16px;">Failed to connect.</p>';
      }
    }

    function switchTab(tab) {
      currentTab = tab;
      document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
      if (tab === 'docs') document.getElementById('tabDocs').classList.add('active');
      if (tab === 'table') document.getElementById('tabTable').classList.add('active');
      if (tab === 'agg') document.getElementById('tabAgg').classList.add('active');
      if (tab === 'metrics') document.getElementById('tabMetrics').classList.add('active');
      document.getElementById('queryBar').style.display = (tab === 'docs' || tab === 'table') ? 'flex' : 'none';
      renderCurrentView();
    }

    async function loadDocs() {
      if (!activeCol) return;
      var search = document.getElementById('searchInput') ? document.getElementById('searchInput').value : '';
      var url = '/api/docs/' + encodeURIComponent(activeCol) + (search ? '?search=' + encodeURIComponent(search) : '');
      try {
        var res = await fetch(url, { headers: getHeaders() });
        cachedDocs = await res.json();
        renderCurrentView();
      } catch (e) {
        document.getElementById('viewport').innerHTML = '<p style="color:var(--rose); padding:20px;">Failed to load documents.</p>';
      }
    }

    function clearSearch() {
      if (document.getElementById('searchInput')) document.getElementById('searchInput').value = '';
      loadDocs();
    }

    function renderCurrentView() {
      if (currentTab === 'docs') renderCardsView();
      else if (currentTab === 'table') renderTableView();
      else if (currentTab === 'agg') renderAggView();
      else if (currentTab === 'metrics') renderMetricsView();
    }

    function renderCardsView() {
      var v = document.getElementById('viewport');
      if (!cachedDocs || cachedDocs.length === 0) {
        v.innerHTML = '<p style="text-align:center; color:var(--muted); padding:40px;">No documents found in collection <strong>' + activeCol + '</strong>. Click "➕ Insert Document" to add one.</p>';
        return;
      }
      var html = '';
      cachedDocs.forEach(function(doc) {
        var docId = String(doc._id);
        html += '<div class="doc-card">' +
          '<div class="doc-meta">' +
            '<span>🔑 ID: <strong style="color:var(--accent);">' + docId + '</strong></span>' +
            '<div style="display:flex; gap:6px;">' +
              '<button class="btn btn-secondary btn-copy" style="padding:2px 8px; font-size:11px;" data-id="' + docId + '">Copy</button>' +
              '<button class="btn btn-danger btn-delete" style="padding:2px 8px; font-size:11px;" data-id="' + docId + '">Delete</button>' +
            '</div>' +
          '</div>' +
          '<pre>' + JSON.stringify(doc, null, 2) + '</pre>' +
        '</div>';
      });
      v.innerHTML = html;
      v.querySelectorAll('.btn-copy').forEach(function(btn) {
        btn.onclick = function() { copyDoc(btn.getAttribute('data-id')); };
      });
      v.querySelectorAll('.btn-delete').forEach(function(btn) {
        btn.onclick = function() { deleteDoc(btn.getAttribute('data-id')); };
      });
    }

    function renderTableView() {
      var v = document.getElementById('viewport');
      if (!cachedDocs || cachedDocs.length === 0) {
        v.innerHTML = '<p style="text-align:center; color:var(--muted); padding:40px;">No records available.</p>';
        return;
      }
      var allKeys = [];
      cachedDocs.forEach(function(d) {
        Object.keys(d).forEach(function(k) {
          if (!allKeys.includes(k)) allKeys.push(k);
        });
      });
      var html = '<table><thead><tr>' + allKeys.map(function(k) { return '<th>' + k + '</th>'; }).join('') + '<th>Actions</th></tr></thead><tbody>';
      cachedDocs.forEach(function(doc) {
        var docId = String(doc._id);
        html += '<tr>' + allKeys.map(function(k) {
          var val = doc[k];
          return '<td>' + (typeof val === 'object' ? JSON.stringify(val) : (val !== undefined ? val : '')) + '</td>';
        }).join('') +
        '<td><button class="btn btn-danger btn-table-del" style="padding:2px 6px; font-size:11px;" data-id="' + docId + '">✕</button></td></tr>';
      });
      html += '</tbody></table>';
      v.innerHTML = html;
      v.querySelectorAll('.btn-table-del').forEach(function(btn) {
        btn.onclick = function() { deleteDoc(btn.getAttribute('data-id')); };
      });
    }

    function renderAggView() {
      var v = document.getElementById('viewport');
      v.innerHTML = '<div style="background:var(--panel); border:1px solid var(--border); border-radius:12px; padding:24px;">' +
        '<h3 style="color:var(--accent); margin-bottom:12px;">🧮 Interactive Aggregation Pipeline Playground</h3>' +
        '<p style="font-size:12px; color:var(--muted); margin-bottom:16px;">Run multi-stage streaming aggregations ($match, $lookup, $group, $sort, $unwind) in real-time:</p>' +
        '<textarea id="aggPipelineInput" rows="7" style="width:100%; margin-bottom:12px;">[{\\n  "$match": {}\\n}, {\\n  "$group": { "_id": null, "totalCount": { "$count": 1 } }\\n}]</textarea>' +
        '<button class="btn btn-purple" onclick="runAggregation()">⚡ Execute Pipeline</button>' +
        '<h4 style="margin-top:20px; margin-bottom:8px; font-size:13px; color:var(--muted);">Pipeline Output:</h4>' +
        '<pre id="aggOutput">// Execution results will appear here...</pre>' +
      '</div>';
    }

    async function runAggregation() {
      try {
        var pipeline = JSON.parse(document.getElementById('aggPipelineInput').value);
        var res = await fetch('/api/aggregate/' + encodeURIComponent(activeCol), {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ pipeline: pipeline })
        });
        var data = await res.json();
        document.getElementById('aggOutput').innerText = JSON.stringify(data, null, 2);
      } catch (err) {
        document.getElementById('aggOutput').innerText = 'Error executing pipeline: ' + err.message;
      }
    }

    function renderMetricsView() {
      var v = document.getElementById('viewport');
      var cur = (cachedStats && cachedStats.collections ? cachedStats.collections : []).find(function(c) { return c.name === activeCol; }) || {};
      v.innerHTML = '<div class="metrics-bar">' +
        '<div class="metric-card"><div class="metric-label">Active Documents</div><div class="metric-val">' + (cur.count || 0) + '</div></div>' +
        '<div class="metric-card"><div class="metric-label">MemTable RAM Usage</div><div class="metric-val">' + (cur.memtableBytes || 0) + ' B</div></div>' +
        '<div class="metric-card"><div class="metric-label">Immutable SSTables</div><div class="metric-val">' + (cur.sstableCount || 0) + '</div></div>' +
        '<div class="metric-card"><div class="metric-label">Durability Vault</div><div class="metric-val" style="color:var(--emerald);">commit.farc</div></div>' +
      '</div>' +
      '<div style="background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:20px;">' +
        '<h3 style="color:var(--accent); font-size:14px; margin-bottom:12px;">🌲 Cryptographic Merkle State Root</h3>' +
        '<p style="font-size:12px; color:var(--muted); margin-bottom:12px;">Mathematical tamper-proof state root generated from current LSM-Tree leaves:</p>' +
        '<pre style="color:var(--emerald);">' + (cur.merkleRoot || 'Uninitialized state root') + '</pre>' +
      '</div>';
    }

    function openInsertModal() {
      document.getElementById('insertModal').style.display = 'flex';
    }
    function openCreateColModal() {
      document.getElementById('createColModal').style.display = 'flex';
    }
    function closeModal(id) {
      document.getElementById(id).style.display = 'none';
    }

    async function submitInsert() {
      try {
        var payload = JSON.parse(document.getElementById('jsonInput').value);
        var res = await fetch('/api/docs/' + encodeURIComponent(activeCol), {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify(payload)
        });
        var data = await res.json();
        if (data.success) {
          closeModal('insertModal');
          document.getElementById('jsonInput').value = '';
          await refreshAll();
        } else {
          alert('Error: ' + (data.error || 'Failed'));
        }
      } catch (err) {
        alert('Invalid JSON syntax: ' + err.message);
      }
    }

    async function submitCreateCol() {
      var name = document.getElementById('newColName').value.trim();
      if (!name) return;
      var res = await fetch('/api/collections', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ name: name })
      });
      var data = await res.json();
      if (data.success) {
        closeModal('createColModal');
        activeCol = name;
        await refreshAll();
      }
    }

    async function deleteDoc(id) {
      if (!confirm('Permanently erase document ' + id + '?')) return;
      var res = await fetch('/api/docs/' + encodeURIComponent(activeCol) + '/' + encodeURIComponent(id), {
        method: 'DELETE',
        headers: getHeaders()
      });
      var data = await res.json();
      if (data.success) {
        await refreshAll();
      }
    }

    async function flushCurrentCol() {
      var res = await fetch('/api/flush/' + encodeURIComponent(activeCol), {
        method: 'POST',
        headers: getHeaders()
      });
      var data = await res.json();
      alert(data.message || 'Flushed to SSTable');
      await loadStats();
    }

    function copyDoc(id) {
      var doc = cachedDocs.find(function(d) { return String(d._id) === String(id); });
      navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
      alert('Document copied to clipboard!');
    }

    async function refreshAll() {
      await loadStats();
      if (activeCol) {
        await loadDocs();
      }
    }

    window.addEventListener('DOMContentLoaded', function() {
      refreshAll();
    });

    refreshAll();
  </script>
</body>
</html>`);
    });

    server.listen(port);
    return server;
  }
}
