/* =====================================================================
   db.js  -  DATA LAYER (sirf yehi file backend se baat karti hai)
   Abhi: browser localStorage (demo).
   Baad mein: is file ke andar functions ko Supabase / Google Sheet calls
   se badal dein. Baqi saare pages ko haath nahi lagana parega.
   Har function async hai taake network backend par bhi same chale.
   ===================================================================== */
const DB = (() => {
  const P = 'serp_';
  const read  = t => JSON.parse(localStorage.getItem(P + t) || '[]');
  const write = (t, d) => localStorage.setItem(P + t, JSON.stringify(d));
  const uid   = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const now   = () => new Date().toISOString();

  const TABLES = ['sessions', 'classes', 'sections', 'users', 'audit', 'fee_heads', 'enquiries', 'applicants', 'students', 'student_discounts', 'receipts', 'ledger', 'fee_structure', 'student_rates', 'fee_increments', 'challans'];
  const HEADS = [['Registration', 'one_time'], ['Admission', 'one_time'], ['Annual', 'yearly'], ['Tuition', 'monthly'],
                 ['Exam', 'yearly'], ['Transport', 'monthly'], ['Lab', 'yearly'], ['Fine', 'one_time']];
  // Nayi tables purane data ko todye baghair add hoti hain
  function migrate() {
    if (!localStorage.getItem(P + 'fee_heads'))
      write('fee_heads', HEADS.map(([name, type]) => ({ id: uid(), name, type, system: true })));
  }

  async function sha(text) {
    if (!(window.crypto && crypto.subtle)) return 'plain:' + text;
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  const DEFAULT_SETTINGS = {
    school_name: 'My School', address: '', phone: '', email: '', principal: '',
    currency: 'Rs.', reg_prefix: 'REG', gr_prefix: 'GR', receipt_prefix: 'RC',
    clerk_discount_limit: 10, registration_refundable: false,
    rounding: 1, receipt_size: 'A5', reg_fee_default: 1000, adm_fee_default: 5000, late_fee: 0, due_day: 10
  };

  async function init() {
    if (localStorage.getItem(P + 'seeded')) { migrate(); return; }
    const users = [
      ['admin', 'Administrator', 'admin', 'admin123'],
      ['principal', 'Principal', 'principal', 'principal123'],
      ['accountant', 'Accountant', 'accountant', 'acc123'],
      ['clerk', 'Clerk', 'clerk', 'clerk123']
    ];
    const u = [];
    for (const [username, name, role, pw] of users)
      u.push({ id: uid(), username, name, role, pass_hash: await sha(pw), active: true, created_at: now() });
    write('users', u);

    const y = new Date().getFullYear();
    write('sessions', [{ id: uid(), name: `${y}-${String(y + 1).slice(2)}`, start: `${y}-04-01`, end: `${y + 1}-03-31`, is_active: true }]);

    const names = ['Play Group', 'Nursery', 'Prep', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
    const cls = [], sec = [];
    names.forEach((n, i) => {
      const c = { id: uid(), name: (/^\d+$/.test(n) ? 'Class ' + n : n), order: i + 1, is_last: i === names.length - 1 };
      cls.push(c);
      sec.push({ id: uid(), class_id: c.id, name: 'A', capacity: 40 });
    });
    write('classes', cls); write('sections', sec);
    write('audit', []);
    localStorage.setItem(P + 'settings', JSON.stringify(DEFAULT_SETTINGS));
    localStorage.setItem(P + 'seeded', '1');
    migrate();
  }

  return {
    init, sha, uid,
    async list(t, fn)   { const r = read(t); return fn ? r.filter(fn) : r; },
    async get(t, id)    { return read(t).find(x => x.id === id) || null; },
    async insert(t, row){ const r = read(t); row = { id: uid(), created_at: now(), ...row }; r.push(row); write(t, r); return row; },
    async update(t, id, patch) {
      const r = read(t), i = r.findIndex(x => x.id === id);
      if (i < 0) return null;
      r[i] = { ...r[i], ...patch, updated_at: now() }; write(t, r); return r[i];
    },
    async remove(t, id) { write(t, read(t).filter(x => x.id !== id)); },
    async removeWhere(t, fn) { write(t, read(t).filter(x => !fn(x))); },

    /* Auto numbers: nextNo('gr') -> 1,2,3... (backup mein shamil) */
    nextNo(name) {
      const c = JSON.parse(localStorage.getItem(P + 'counters') || '{}');
      c[name] = (c[name] || 0) + 1; localStorage.setItem(P + 'counters', JSON.stringify(c)); return c[name];
    },
    /* Ledger balance: field = 'student_id' ya 'applicant_id'. + = dues (baqaya) */
    async balance(field, id) {
      return read('ledger').filter(x => x[field] === id).reduce((a, x) => a + (+x.debit || 0) - (+x.credit || 0), 0);
    },

    async getSettings() { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(P + 'settings') || '{}') }; },
    async saveSettings(s) { localStorage.setItem(P + 'settings', JSON.stringify(s)); return s; },

    async log(user, action, detail) {
      const r = read('audit'); r.push({ id: uid(), at: now(), user, action, detail }); write('audit', r.slice(-500));
    },

    /* Backup / restore */
    async exportAll() {
      const out = { version: 1, exported_at: now(), settings: await this.getSettings() };
      Object.keys(localStorage).filter(k => k.startsWith(P) && !['seeded', 'settings'].some(x => k === P + x))
        .forEach(k => { try { out[k.slice(P.length)] = JSON.parse(localStorage.getItem(k)); } catch (e) {} });
      return out;
    },
    async importAll(obj) {
      if (!obj || obj.version !== 1) throw new Error('Ye is ERP ki backup file nahi hai');
      Object.keys(localStorage).filter(k => k.startsWith(P)).forEach(k => localStorage.removeItem(k));
      for (const k of Object.keys(obj)) {
        if (['version', 'exported_at'].includes(k)) continue;
        localStorage.setItem(P + k, JSON.stringify(obj[k]));
      }
      localStorage.setItem(P + 'seeded', '1');
    },
    async resetAll() { Object.keys(localStorage).filter(k => k.startsWith(P)).forEach(k => localStorage.removeItem(k)); await init(); }
  };
})();
