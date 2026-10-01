/* =====================================================================
   db.js  -  DATA LAYER (sirf yehi file backend se baat karti hai)
   Do tareeqe, ek hi API:
     LocalDB : browser localStorage (demo, js/config.js khali ho to)
     SupaDB  : Supabase (js/config.js mein URL aur key likhein)
   Baqi saare pages DB.list / DB.insert ... ek jaisay istemal karte hain.
   ===================================================================== */
const LocalDB = (() => {
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
    mode: 'local',
    init, sha, uid,
    async authLogin(username, password) {
      const u = read('users').find(x => x.username.toLowerCase() === username.trim().toLowerCase());
      if (!u || !u.active || u.pass_hash !== await sha(password)) return null;
      localStorage.setItem('serp_auth', u.id); await this.log(u.username, 'login', ''); return u;
    },
    async authCurrent() {
      const id = localStorage.getItem('serp_auth'); if (!id) return null;
      const u = read('users').find(x => x.id === id); return u && u.active ? u : null;
    },
    async authLogout() { localStorage.removeItem('serp_auth'); },
    async createUser({ username, name, role, password }) {
      return this.insert('users', { username, name, role, active: true, pass_hash: await sha(password) });
    },
    async setPassword(userId, password) {
      const u = await this.update('users', userId, { pass_hash: await sha(password) });
      if (u && u.username === 'admin') localStorage.setItem('serp_pw_changed', '1');
    },
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


/* =====================================================================
   SupaDB - Supabase backend (supabase/schema.sql wali tables)
   ===================================================================== */
const makeSupaDB = () => {
  const cfg = window.APP_CONFIG;
  const KEY_ = String(cfg.SUPABASE_KEY || '').trim();
  let URL_;
  try { URL_ = new URL(String(cfg.SUPABASE_URL || '').trim()).origin; }      // /rest/v1/ ya aakhri / ho to bhi theek
  catch (e) { throw new Error('SUPABASE_URL theek nahi. Ye https://xxxx.supabase.co jaisa hona chahiye.'); }
  if (!/^https?:/.test(URL_)) throw new Error('SUPABASE_URL https:// se shuru hona chahiye.');
  if (/^sb_secret_|service_role/i.test(KEY_)) throw new Error('Ye SECRET key hai! Yahan sirf Publishable (ya anon) key likhein, aur secret key foran Supabase mein regenerate karein.');
  if (KEY_.length < 20) throw new Error('SUPABASE_KEY khali ya adhoori hai. Publishable key poori copy karein.');
  const sb = supabase.createClient(URL_, KEY_);
  const ALIAS = { users: 'profiles' };
  const COLS = {"profiles": ["id", "username", "name", "role", "active", "created_at", "updated_at"], "settings": ["id", "data", "updated_at"], "sessions": ["id", "name", "start_date", "end_date", "is_active", "created_at", "updated_at"], "classes": ["id", "name", "sort_order", "is_last", "created_at", "updated_at"], "sections": ["id", "class_id", "name", "capacity", "created_at", "updated_at"], "fee_heads": ["id", "name", "type", "system", "created_at", "updated_at"], "fee_structure": ["id", "class_id", "head_id", "amount", "created_at", "updated_at"], "enquiries": ["id", "name", "phone", "class_id", "note", "date", "status", "created_at", "updated_at"], "applicants": ["id", "reg_no", "name", "father", "gender", "phone", "address", "class_id", "session_id", "reg_date", "reg_gross", "reg_discount", "reg_net", "status", "enquiry_id", "student_id", "created_at", "updated_at"], "students": ["id", "gr_no", "reg_no", "applicant_id", "name", "father", "gender", "dob", "b_form", "cnic", "phone", "whatsapp", "address", "class_id", "section_id", "session_id", "admission_date", "prev_school", "sibling_of", "docs", "status", "status_date", "status_reason", "passout_year", "slc_no", "status_history", "created_at", "updated_at"], "student_discounts": ["id", "student_id", "head", "type", "value", "applies", "from_month", "to_month", "session_id", "reason", "by", "used_at", "last_session", "created_at", "updated_at"], "student_rates": ["id", "student_id", "head_id", "amount", "effective_from", "created_at", "updated_at"], "fee_increments": ["id", "student_id", "head", "old_amount", "new_amount", "effective_from", "by", "date", "created_at", "updated_at"], "challans": ["id", "no", "student_id", "class_id", "month", "session_id", "due_date", "lines", "gross", "discount", "all_discount", "net", "late_fee", "paid", "rules_used", "by", "created_at", "updated_at"], "receipts": ["id", "no", "type", "date", "title", "party", "ref", "lines", "gross", "discount", "net", "received", "balance", "mode", "by", "remarks", "student_id", "applicant_id", "created_at", "updated_at"], "ledger": ["id", "student_id", "applicant_id", "challan_id", "date", "detail", "ref", "head", "kind", "debit", "credit", "created_at", "updated_at"], "counters": ["name", "value"], "audit": ["id", "at", "user_name", "action", "detail"]};
  // App ke purane naam <-> database ke naam
  const TO_DB = { classes: { order: 'sort_order' }, sessions: { start: 'start_date', end: 'end_date' },
                  student_discounts: { from: 'from_month', to: 'to_month' }, audit: { user: 'user_name' } };
  const FROM_DB = {}; Object.keys(TO_DB).forEach(t => { FROM_DB[t] = {}; Object.entries(TO_DB[t]).forEach(([a, b]) => FROM_DB[t][b] = a); });
  const NULL_IF_EMPTY = c => /_id$/.test(c) || ['sibling_of', 'last_session', 'passout_year', 'used_at', 'dob', 'admission_date', 'reg_date', 'status_date',
    'due_date', 'date', 'start_date', 'end_date', 'sort_order', 'capacity', 'amount', 'value'].includes(c);
  const tname = t => ALIAS[t] || t;

  const toDb = (t, row) => {
    const table = tname(t), out = {};
    for (const k of Object.keys(row)) {
      const dk = (TO_DB[table] || {})[k] || k;
      if (!COLS[table].includes(dk) || row[k] === undefined) continue;
      out[dk] = (row[k] === '' && NULL_IF_EMPTY(dk)) ? null : row[k];
    }
    return out;
  };
  const fromDb = (t, row) => {
    if (!row) return row; const m = FROM_DB[tname(t)]; if (!m) return row;
    const o = {}; for (const k of Object.keys(row)) o[m[k] || k] = row[k]; return o;
  };
  const friendly = e => {
    const m = (e && e.message) || String(e);
    if (/row-level security|permission denied/i.test(m)) return new Error('Aap ke role ko is kaam ki ijazat nahi hai.');
    if (/duplicate key/i.test(m)) return new Error('Ye record pehle se maujood hai (duplicate).');
    if (/foreign key/i.test(m)) return new Error('Ye record kisi doosre record se juda hai, is liye nahi badla/hata sakte.');
    if (/Failed to fetch|NetworkError/i.test(m)) return new Error('Internet ya Supabase se rabta nahi ho raha.');
    return new Error(m);
  };
  const chk = r => { if (r.error) throw friendly(r.error); return r.data; };

  // 4 second ka chhota cache (ek page par bar bar list na mangni paray). Likhne par table ka cache saaf.
  const cache = {}; const TTL = 4000;
  const dirty = t => { delete cache[tname(t)]; };

  async function fetchAll(table, order = 'id') {
    let all = [], from = 0;
    for (;;) {
      const d = chk(await sb.from(table).select('*').order(order).range(from, from + 999));
      all = all.concat(d); if (d.length < 1000) break; from += 1000;
    }
    return all;
  }
  const DEFAULT_SETTINGS = {
    school_name: 'My School', address: '', phone: '', email: '', principal: '', currency: 'Rs.', reg_prefix: 'REG', gr_prefix: 'GR', receipt_prefix: 'RC',
    clerk_discount_limit: 10, registration_refundable: false, rounding: 1, receipt_size: 'A5', reg_fee_default: 1000, adm_fee_default: 5000, late_fee: 0, due_day: 10
  };
  const emailOf = u => { u = String(u).trim().toLowerCase(); return u.includes('@') ? u : `${u}@${cfg.LOGIN_DOMAIN || 'school.local'}`; };
  const profile = async id => fromDb('users', chk(await sb.from('profiles').select('*').eq('id', id).maybeSingle()));

  return {
    mode: 'supabase',
    async init() {},
    uid: () => crypto.randomUUID(),

    async list(t, fn) {
      const table = tname(t), c = cache[table];
      let rows;
      if (c && Date.now() - c.at < TTL) rows = c.rows;
      else { rows = (await fetchAll(table, table === 'counters' ? 'name' : 'id')).map(r => fromDb(t, r)); cache[table] = { at: Date.now(), rows }; }
      rows = rows.map(r => ({ ...r }));
      return fn ? rows.filter(fn) : rows;
    },
    async get(t, id) { return fromDb(t, chk(await sb.from(tname(t)).select('*').eq('id', id).maybeSingle())); },
    async insert(t, row) {
      const d = chk(await sb.from(tname(t)).insert(toDb(t, row)).select().single()); dirty(t); return fromDb(t, d);
    },
    async update(t, id, patch) {
      const d = chk(await sb.from(tname(t)).update(toDb(t, patch)).eq('id', id).select().maybeSingle()); dirty(t);
      if (!d) throw new Error('Record update nahi hua (mila nahi, ya aap ke role ko ijazat nahi).');
      return fromDb(t, d);
    },
    async remove(t, id) { chk(await sb.from(tname(t)).delete().eq('id', id)); dirty(t); },
    async removeWhere(t, fn) {
      const ids = (await this.list(t, fn)).map(r => r.id);
      for (let i = 0; i < ids.length; i += 100) {
        const d = chk(await sb.from(tname(t)).delete().in('id', ids.slice(i, i + 100)).select('id'));
        if (d.length < ids.slice(i, i + 100).length) { dirty(t); throw new Error('Delete ki ijazat nahi hai.'); }
      }
      dirty(t);
    },

    async nextNo(name) { return Number(chk(await sb.rpc('next_no', { p_name: name }))); },
    async balance(field, id) {
      let sum = 0, from = 0;
      for (;;) {
        const d = chk(await sb.from('ledger').select('debit,credit').eq(field, id).range(from, from + 999));
        d.forEach(x => sum += (+x.debit || 0) - (+x.credit || 0)); if (d.length < 1000) break; from += 1000;
      }
      return sum;
    },

    async getSettings() {
      const d = chk(await sb.from('settings').select('data').eq('id', 1).maybeSingle());
      return { ...DEFAULT_SETTINGS, ...((d && d.data) || {}) };
    },
    async saveSettings(s) {
      const u = chk(await sb.from('settings').update({ data: s }).eq('id', 1).select());
      if (!u.length) chk(await sb.from('settings').insert({ id: 1, data: s }));
      return s;
    },
    async log(user, action, detail) { try { await sb.from('audit').insert({ user_name: user, action, detail }); } catch (e) {} },

    /* ---- login (Supabase Auth). Username -> username@LOGIN_DOMAIN ---- */
    async authLogin(username, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email: emailOf(username), password });
      if (error) return null;
      const p = await profile(data.user.id);
      if (!p || !p.active) { await sb.auth.signOut(); return null; }
      this.log(p.username, 'login', ''); return p;
    },
    async authCurrent() {
      const { data } = await sb.auth.getSession(); if (!data.session) return null;
      const p = await profile(data.session.user.id); return p && p.active ? p : null;
    },
    async authLogout() { await sb.auth.signOut(); },

    // Naya user: alag temporary client se signUp (admin ka login nahi tootta), phir profile row
    async createUser({ username, name, role, password }) {
      const tmp = supabase.createClient(URL_, KEY_, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'serp-tmp-signup' } });
      const { data, error } = await tmp.auth.signUp({ email: emailOf(username), password });
      if (error) throw new Error('User nahi bana: ' + error.message);
      if (!data.user || (data.user.identities && !data.user.identities.length)) throw new Error('Ye username pehle se registered hai.');
      const row = chk(await sb.from('profiles').insert({ id: data.user.id, username: username.trim().toLowerCase(), name, role, active: true }).select().single());
      dirty('users');
      if (!data.session) return { ...row, note: 'Email confirmation on hai: Supabase > Authentication > Providers > Email mein "Confirm email" band karein ya user ko Dashboard se confirm karein.' };
      return row;
    },
    async setPassword(userId, password) {
      const { data } = await sb.auth.getSession();
      if (!data.session || data.session.user.id !== userId) throw new Error('Dusre user ka password Supabase Dashboard > Authentication > Users se badlein.');
      const { error } = await sb.auth.updateUser({ password }); if (error) throw friendly(error);
    },

    async exportAll() {
      const out = { version: 1, exported_at: new Date().toISOString(), backend: 'supabase', settings: await this.getSettings() };
      for (const t of Object.keys(COLS)) if (!['settings', 'audit'].includes(t)) out[t] = await fetchAll(t, t === 'counters' ? 'name' : 'id');
      return out;
    },
    async importAll() { throw new Error('Supabase mode mein restore band hai (data kharab hone ka khatra). Purana data Google Sheet ke menu se shift karein.'); },
    async resetAll() { throw new Error('Supabase mode mein reset band hai.'); }
  };
};

// Konsa backend? config.js mein URL aur key ho to Supabase, warna demo (localStorage).
// Supabase mein koi masla ho to page toot'ne ke bajaye laal message dikhata hai.
const DB = (() => {
  const c = window.APP_CONFIG || {};
  if (!(c.SUPABASE_URL || c.SUPABASE_KEY)) return LocalDB;
  const fail = msg => {
    console.error('Supabase config masla:', msg);
    const show = () => { const d = document.createElement('div'); d.setAttribute('role', 'alert');
      d.style.cssText = 'background:#c0392b;color:#fff;padding:12px 16px;font:14px/1.4 sans-serif;position:sticky;top:0;z-index:999';
      d.textContent = 'Supabase se connect nahi ho paya: ' + msg + ' (js/config.js check karein)'; document.body.prepend(d); };
    if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
    const err = () => { throw new Error('Supabase se connect nahi: ' + msg); };
    return { mode: 'error', async init() {}, async authCurrent() { return null; }, authLogin: err, authLogout: async () => {},
      list: err, get: err, insert: err, update: err, remove: err, removeWhere: err, nextNo: err, balance: err,
      getSettings: async () => ({ school_name: 'School ERP' }), saveSettings: err, log: async () => {} };
  };
  if (!window.supabase) return fail('Supabase library load nahi hui (internet ya adblock check karein).');
  try { return makeSupaDB(); } catch (e) { return fail(e.message); }
})();
