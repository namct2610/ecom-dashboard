/* ── upload.js — Batch file upload UI ──────────────────────────────────── */
'use strict';

const Upload = (() => {

  /* ── State ── */
  let queue = [];        // { id, file, status: 'pending'|'uploading'|'success'|'error', message }
  let uploading = false;
  let nextId = 1;

  /* ── DOM refs (resolved lazily) ── */
  const $ = id => document.getElementById(id);

  /* ── Init (call once when Upload page is shown) ── */
  function init() {
    const area   = $('uploadArea');
    const input  = $('fileInput');
    const btnUpload = $('btnUpload');
    const btnClear  = $('btnClear');

    if (!area || area._uploadBound) return;
    area._uploadBound = true;

    /* Click anywhere on area triggers file picker */
    area.addEventListener('click', e => {
      if (e.target.closest('#fileInput')) return;
      input.click();
    });

    /* Drag-and-drop */
    area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('drag-over'); });
    area.addEventListener('dragleave', () => area.classList.remove('drag-over'));
    area.addEventListener('drop', e => {
      e.preventDefault();
      area.classList.remove('drag-over');
      addFiles([...e.dataTransfer.files]);
    });

    /* File input change */
    input.addEventListener('change', () => {
      addFiles([...input.files]);
      input.value = '';
    });

    /* Upload button */
    btnUpload.addEventListener('click', startUpload);

    /* Clear button */
    btnClear.addEventListener('click', clearQueue);

    renderQueue();
    updateActions();
  }

  /* ── Add files to queue ── */
  function addFiles(files) {
    const allowed = ['.xlsx', '.xls'];
    files.forEach(f => {
      const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
      if (!allowed.includes(ext)) {
        toast(`"${f.name}" không phải file Excel (.xlsx/.xls)`, 'error');
        return;
      }
      // avoid duplicate filenames already in queue
      if (queue.some(q => q.file.name === f.name && q.status === 'pending')) return;
      queue.push({ id: nextId++, file: f, status: 'pending', message: '' });
    });
    renderQueue();
    updateActions();
  }

  /* ── Render queue ── */
  function renderQueue() {
    const container = $('fileQueue');
    if (!container) return;
    if (!queue.length) { container.innerHTML = ''; return; }

    container.innerHTML = queue.map(item => `
      <div class="file-item" data-id="${item.id}">
        <div class="file-item-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        </div>
        <div class="file-item-info">
          <div class="file-item-name">${escHtml(item.file.name)}</div>
          <div class="file-item-size">${formatSize(item.file.size)}${item.message ? ' · ' + escHtml(item.message) : ''}</div>
          ${item.status === 'uploading' ? '<div class="file-progress"><div class="file-progress-fill" id="prog-' + item.id + '" style="width:0%"></div></div>' : ''}
        </div>
        <span class="file-item-status ${item.status}">${statusLabel(item.status)}</span>
        ${item.status === 'pending' ? `<button class="file-item-remove" onclick="Upload.remove(${item.id})" title="Xoá">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>` : '<span style="width:22px;flex-shrink:0"></span>'}
      </div>
    `).join('');
  }

  function statusLabel(s) {
    return { pending: 'Chờ', uploading: 'Đang xử lý…', success: 'Thành công', error: 'Lỗi' }[s] || s;
  }

  /* ── Remove a file from queue ── */
  function remove(id) {
    queue = queue.filter(q => q.id !== id);
    renderQueue();
    updateActions();
  }

  /* ── Clear completed/error items ── */
  function clearQueue() {
    if (uploading) return;
    queue = queue.filter(q => q.status === 'pending');
    renderQueue();
    renderResults([]);
    updateActions();
  }

  /* ── Update action button states ── */
  function updateActions() {
    const btnUpload = $('btnUpload');
    const btnClear  = $('btnClear');
    if (!btnUpload) return;

    const hasPending = queue.some(q => q.status === 'pending');
    btnUpload.disabled = !hasPending || uploading;
    btnUpload.textContent = uploading ? 'Đang tải…' : `Tải lên (${queue.filter(q=>q.status==='pending').length} file)`;
    if (btnClear) btnClear.disabled = uploading;
  }

  /* ── Sequential upload ── */
  async function startUpload() {
    if (uploading) return;
    const pending = queue.filter(q => q.status === 'pending');
    if (!pending.length) return;

    uploading = true;
    updateActions();

    const allResults = [];

    for (const item of pending) {
      item.status = 'uploading';
      renderQueue();

      try {
        const result = await uploadFile(item);
        item.status = 'success';
        item.message = buildSummary(result);
        allResults.push({ ...result, filename: item.file.name, ok: true });
      } catch (err) {
        item.status = 'error';
        item.message = err.message || 'Lỗi không xác định';
        allResults.push({ filename: item.file.name, ok: false, error: item.message });
      }

      renderQueue();
    }

    uploading = false;
    updateActions();
    renderResults(allResults);

    // Refresh upload history if the function exists
    if (typeof App !== 'undefined' && App.refreshUploadHistory) {
      App.refreshUploadHistory();
    }
  }

  /* ── Upload a single file via XHR (with progress) ── */
  function uploadFile(item) {
    return new Promise((resolve, reject) => {
      const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';

      const formData = new FormData();
      formData.append('files[]', item.file);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'api/upload.php');
      xhr.setRequestHeader('X-CSRF-Token', csrf);
      xhr.withCredentials = true;

      xhr.upload.addEventListener('progress', e => {
        if (e.lengthComputable) {
          const pct = Math.round(e.loaded / e.total * 80); // 80% = upload done; parsing = extra
          const bar = document.getElementById(`prog-${item.id}`);
          if (bar) bar.style.width = pct + '%';
        }
      });

      xhr.addEventListener('load', () => {
        const bar = document.getElementById(`prog-${item.id}`);
        if (bar) bar.style.width = '100%';

        if (xhr.status === 401) {
          reject(new Error('Phiên đăng nhập hết hạn'));
          if (typeof App !== 'undefined') App.showAuth();
          return;
        }
        try {
          const data = JSON.parse(xhr.responseText);
          if (!data.success && !data.results) { reject(new Error(data.error || 'Lỗi server')); return; }
          // data.results is array per file; we sent 1 file
          const r = (data.results || [])[0] || {};
          if (r.error && !r.success) { reject(new Error(r.error)); return; }
          resolve(r);
        } catch (e) {
          reject(new Error('Phản hồi không hợp lệ từ server'));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Lỗi kết nối')));
      xhr.addEventListener('timeout', () => reject(new Error('Hết thời gian chờ')));
      xhr.timeout = 120000;

      xhr.send(formData);
    });
  }

  /* ── Build short summary string ── */
  function buildSummary(r) {
    const parts = [];
    if (r.imported > 0) parts.push(`${r.imported} dòng`);
    if (r.skipped  > 0) parts.push(`${r.skipped} bỏ qua`);
    if (r.errors   > 0) parts.push(`${r.errors} lỗi`);
    return parts.join(', ') || 'Không có dữ liệu mới';
  }

  /* ── Render result cards ── */
  function renderResults(results) {
    const container = $('uploadResults');
    if (!container) return;
    if (!results.length) { container.innerHTML = ''; return; }

    container.innerHTML = results.map(r => `
      <div class="upload-result-item ${r.ok ? 'success' : 'error'}">
        <div class="upload-result-icon">
          ${r.ok
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
          }
        </div>
        <div class="upload-result-content">
          <div class="upload-result-filename">${escHtml(r.filename)}</div>
          <div class="upload-result-detail">${r.ok ? escHtml(buildSummary(r)) : escHtml(r.error || 'Lỗi không xác định')}</div>
        </div>
      </div>
    `).join('');
  }

  /* ── Helpers ── */
  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(msg, type = 'info', duration = 3000) {
    if (typeof window.toast === 'function') { window.toast(msg, type, duration); return; }
    const c = document.getElementById('toast-container');
    if (!c) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(() => el.remove(), duration);
  }

  return { init, remove, clearQueue };
})();
