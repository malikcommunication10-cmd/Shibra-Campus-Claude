/* app.js - common helpers: Auth, Modal, Toast, formatting, dual % / Rs box */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n, cur = 'Rs.') => cur + ' ' + (Number(n) || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

/* ---------- Roles ---------- */
const ROLES = {
  admin:      { label: 'Admin',      pages: '*', readonly: false },
  principal:  { label: 'Principal',  pages: '*', readonly: true },
  accountant: { label: 'Accountant', pages: ['dashboard', 'students', 'fee-structure', 'fee-collection', 'fee-ledger', 'books-items', 'books-purchase', 'books-sale', 'accounts', 'reports', 'staff'], readonly: false },
  clerk:      { label: 'Clerk',      pages: ['dashboard', 'admission', 'students', 'fee-collection', 'fee-ledger', 'books-sale'], readonly: false }
};

/* ---------- Auth (DB layer se: demo ya Supabase Auth) ---------- */
const Auth = {
  login: (u, p) => DB.authLogin(u, p),
  current: () => DB.authCurrent(),
  async logout() { await DB.authLogout(); location.href = 'index.html'; },
  canOpen(user, page) { const r = ROLES[user.role]; return r && (r.pages === '*' || r.pages.includes(page)); },
  isReadonly(user) { return !!(ROLES[user.role] && ROLES[user.role].readonly); }
};

/* ---------- Toast ---------- */
function toast(msg, err = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg; t.setAttribute('role', 'status');
  document.body.appendChild(t); setTimeout(() => t.remove(), 2800);
}

/* ---------- Modal ----------
   Modal.open({title, body(html), saveText, onSave(closeFn) -> return false to stay open}) */
const Modal = {
  open({ title, body, saveText = 'Save', onSave, hideSave = false, wide = false }) {
    this.close();
    const bg = document.createElement('div'); bg.className = 'modal-bg'; bg.id = 'modal';
    bg.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-h"><h3>${esc(title)}</h3><button type="button" aria-label="Close" data-x>&times;</button></div>
      <div class="modal-b">${body}</div>
      <div class="modal-f"><button type="button" class="btn ghost" data-x>Cancel</button>
      ${hideSave ? '' : `<button type="button" class="btn" data-save>${esc(saveText)}</button>`}</div></div>`;
    bg.addEventListener('mousedown', e => { if (e.target === bg) this.close(); });
    bg.querySelectorAll('[data-x]').forEach(b => b.onclick = () => this.close());
    const sv = bg.querySelector('[data-save]');
    if (sv) sv.onclick = async () => { sv.disabled = true; const r = await onSave(); sv.disabled = false; if (r !== false) this.close(); };
    document.body.appendChild(bg);
    const f = bg.querySelector('input,select,textarea'); if (f) f.focus();
    return bg;
  },
  close() { const m = $('#modal'); if (m) m.remove(); }
};
document.addEventListener('keydown', e => { if (e.key === 'Escape') Modal.close(); });

function confirmBox(message, okText = 'Yes, continue') {
  return new Promise(res => {
    Modal.open({ title: 'Please confirm', body: `<p>${esc(message)}</p>`, saveText: okText,
      onSave: () => { res(true); } });
    const m = $('#modal');
    m.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => res(false)));
  });
}

/* ---------- Dual box: % aur Rs. ek doosre ko khud calculate karte hain ----------
   dualLink(pctInput, rsInput, () => baseAmount, onChange)
   Jo box edit karo wo master, doosra auto update. Discount + Increment mein use hoga. */
function dualLink(pctEl, rsEl, getBase, onChange) {
  const r2 = n => Math.round(n * 100) / 100;
  pctEl.addEventListener('input', () => {
    const b = getBase(); rsEl.value = pctEl.value === '' ? '' : r2(b * parseFloat(pctEl.value) / 100);
    onChange && onChange('pct');
  });
  rsEl.addEventListener('input', () => {
    const b = getBase(); pctEl.value = (rsEl.value === '' || !b) ? '' : r2(parseFloat(rsEl.value) / b * 100);
    onChange && onChange('rs');
  });
}

function downloadJSON(obj, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

function switchTabs(root = document) {
  const btns = $$('.tabs button', root);
  btns.forEach(b => b.onclick = () => {
    btns.forEach(x => x.classList.toggle('on', x === b));
    $$('[data-pane]', root).forEach(p => p.classList.toggle('hide', p.dataset.pane !== b.dataset.tab));
  });
}

/* ---------- Discount widget: [ % | Rs. ] + value ---------- */
const DISCOUNT_REASONS = ['Sibling', 'Staff Child', 'Scholarship', 'Merit', 'Orphan/Zakat', 'Special Concession', 'Other'];
const Disc = {
  html(id) { return `<div class="dual" style="grid-template-columns:84px 1fr"><select id="${id}T" aria-label="Discount type"><option value="pct">%</option><option value="rs">Rs.</option></select><input id="${id}V" type="number" min="0" step="any" placeholder="0" aria-label="Discount value"></div>`; },
  amount(id, base) {
    const t = $('#' + id + 'T').value, v = parseFloat($('#' + id + 'V').value) || 0;
    const d = t === 'pct' ? base * v / 100 : v;
    return Math.min(Math.max(Math.round(d * 100) / 100, 0), base);
  },
  bind(id, fn) { ['T', 'V'].forEach(x => $('#' + id + x).addEventListener('input', fn)); },
  // Clerk ke liye limit; zyada par Admin/Principal chahiye
  check(id, base, ctx) {
    if (ctx.user.role !== 'clerk') return null;
    const pct = base ? this.amount(id, base) / base * 100 : 0;
    return pct > ctx.settings.clerk_discount_limit ? `Discount ${ctx.settings.clerk_discount_limit}% se zyada hai. Admin/Principal ki approval chahiye.` : null;
  }
};

/* ---------- Numbers ---------- */
const pad = (n, w) => String(n).padStart(w, '0');
const nextReceiptNo = async s => `${s.receipt_prefix}-${pad(await DB.nextNo('receipt'), 6)}`;

/* ---------- Receipt (print) ----------
   r = {no,date,title,party,ref,lines:[{detail,amount}],gross,discount,net,received,balance,mode,by} */
const Receipt = {
  show(r, s) {
    const size = (s.receipt_size || 'A5').toLowerCase();
    const body = `<div class="receipt ${size}">
      <div class="rc-head"><b>${esc(s.school_name)}</b><div>${esc(s.address || '')} ${esc(s.phone || '')}</div><div class="rc-title">${esc(r.title)}</div></div>
      <div class="rc-meta"><span>No: <b>${esc(r.no)}</b></span><span>Date: ${fmtDate(r.date)}</span></div>
      <div class="rc-meta"><span>${esc(r.party)}</span><span>${esc(r.ref || '')}</span></div>
      <table><tbody>${r.lines.map(l => `<tr><td>${esc(l.detail)}</td><td class="num">${money(l.amount, s.currency)}</td></tr>`).join('')}
        <tr><td>Gross</td><td class="num">${money(r.gross, s.currency)}</td></tr>
        ${r.discount ? `<tr><td>Discount</td><td class="num">- ${money(r.discount, s.currency)}</td></tr>` : ''}
        <tr><td><b>Net payable</b></td><td class="num"><b>${money(r.net, s.currency)}</b></td></tr>
        <tr><td>Received (${esc(r.mode)})</td><td class="num">${money(r.received, s.currency)}</td></tr>
        <tr><td>Balance due</td><td class="num">${money(r.balance, s.currency)}</td></tr></tbody></table>
      <div class="rc-sign"><span>Received by: ${esc(r.by)}</span><span>Signature / Stamp</span></div></div>`;
    Modal.open({ title: 'Receipt', body, wide: true, saveText: 'Print', onSave: () => {
      document.body.classList.add('printing'); window.print(); document.body.classList.remove('printing'); return false; } });
  }
};

const STATUS_BADGE = { Active: 'ok', Inactive: 'warn', Passout: '', Registered: 'ok', Admitted: 'ok', Waiting: 'warn', Cancelled: 'bad', Open: 'warn', Closed: '' };
const sbadge = st => `<span class="badge ${STATUS_BADGE[st] ?? ''}">${esc(st)}</span>`;

/* class-wise fee (fee_structure) se amount; na mile to fallback */
async function classFee(classId, headName, fallback) {
  const h = (await DB.list('fee_heads')).find(x => x.name === headName);
  const r = h && (await DB.list('fee_structure', x => x.class_id === classId && x.head_id === h.id))[0];
  return r ? +r.amount : (fallback || 0);
}

/* Student search box: bindPicker('id', student => ...) ; HTML: pickerHTML('id') */
const pickerHTML = id => `<div class="picker"><input id="${id}" type="search" placeholder="Name, GR no ya phone likhein" autocomplete="off"><div class="pick-list hide" id="${id}List"></div></div>`;
async function bindPicker(id, onPick, filter) {
  const all = (await DB.list('students')).filter(filter || (() => true)), inp = $('#' + id), list = $('#' + id + 'List');
  const cls = Object.fromEntries((await DB.list('classes')).map(c => [c.id, c.name]));
  inp.addEventListener('input', () => {
    const q = inp.value.trim().toLowerCase();
    if (q.length < 2) return list.classList.add('hide');
    const m = all.filter(s => [s.name, s.father, s.gr_no, s.phone].join(' ').toLowerCase().includes(q)).slice(0, 8);
    list.innerHTML = m.map(s => `<button type="button" data-id="${s.id}"><b>${esc(s.name)}</b> <span class="muted">${esc(s.gr_no)} &middot; ${esc(cls[s.class_id] || '')} &middot; ${esc(s.father)}</span> ${s.status !== 'Active' ? sbadge(s.status) : ''}</button>`).join('') || '<div class="empty">Koi student nahi mila</div>';
    list.classList.remove('hide');
  });
  list.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; list.classList.add('hide'); inp.value = ''; onPick(all.find(s => s.id === b.dataset.id)); });
}

/* Koi bhi database error ho to chup chap fail hone ke bajaye screen par dikhao */
window.addEventListener('unhandledrejection', e => { const m = e.reason && e.reason.message; if (m) { toast(m, true); console.error(e.reason); } });
