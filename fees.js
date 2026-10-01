/* fees.js - fee ka shared logic: rate lookup, discount rules, challan calculation.
   Data sirf DB.* se aata hai, isliye Supabase par bhi same chalega. */
const r2 = n => Math.round((+n || 0) * 100) / 100;
const roundTo = (n, step) => step > 1 ? Math.round(n / step) * step : Math.round(n);
const monthLabel = m => m ? new Date(m + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '';
const curMonth = () => new Date().toISOString().slice(0, 7);
const waLink = (phone, text) => {
  let n = String(phone || '').replace(/\D/g, '');
  if (n.startsWith('0')) n = '92' + n.slice(1);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : '';
};
const outstanding = c => r2((c.net || 0) + (c.late_fee || 0) - (c.paid || 0));

const Fees = {
  async data() {
    const [heads, structure, rates, rules] = await Promise.all([DB.list('fee_heads'), DB.list('fee_structure'), DB.list('student_rates'), DB.list('student_discounts')]);
    return { heads, structure, rates, rules };
  },
  // Student ka rate: student-wise (effective_from tak) warna class ka amount
  rate(D, st, head, month) {
    const r = D.rates.filter(x => x.student_id === st.id && x.head_id === head.id && x.effective_from <= month)
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from) || (b.created_at || '').localeCompare(a.created_at || ''))[0];
    if (r) return +r.amount;
    const s = D.structure.find(x => x.class_id === st.class_id && x.head_id === head.id);
    return s ? +s.amount : 0;
  },
  ruleActive(r, month, session) {
    switch (r.applies) {
      case 'once': return !r.used_at;
      case 'yearly': return !session || r.last_session !== session.id;
      case 'session': return !r.session_id || !session || r.session_id === session.id;
      case 'range': return month >= r.from && month <= r.to;
      default: return true; // monthly
    }
  },
  // Ek student ka challan (bina save kiye). extraIds = is dafa shamil hone wale yearly/one-time heads
  compute(D, st, month, extraIds, session, challans) {
    const mine = challans.filter(c => c.student_id === st.id), sid = session && session.id;
    const lines = [];
    for (const h of D.heads) {
      if (h.system && ['Registration', 'Admission'].includes(h.name)) continue;
      if (!(h.type === 'monthly' || extraIds.includes(h.id))) continue;
      const billed = h.type === 'monthly'
        ? mine.some(c => c.month === month && c.lines.some(l => l.head_id === h.id))
        : mine.some(c => c.session_id === sid && c.lines.some(l => l.head_id === h.id));
      if (billed) continue;
      const gross = this.rate(D, st, h, month);
      if (gross > 0) lines.push({ head_id: h.id, head: h.name, gross, discount: 0 });
    }
    const rules = D.rules.filter(r => r.student_id === st.id && this.ruleActive(r, month, session));
    const used = new Set();
    for (const l of lines) for (const r of rules.filter(r => r.head === l.head)) {
      const d = r.type === 'pct' ? l.gross * r.value / 100 : +r.value;
      const nd = Math.min(l.gross, r2(l.discount + d)); if (nd > l.discount) used.add(r.id); l.discount = nd;
    }
    const gross = r2(lines.reduce((a, l) => a + l.gross, 0)), lineDisc = r2(lines.reduce((a, l) => a + l.discount, 0));
    const rem = gross - lineDisc; let all = 0;
    if (lines.length) for (const r of rules.filter(r => r.head.startsWith('All fees'))) {
      const d = r.type === 'pct' ? rem * r.value / 100 : +r.value;
      const na = Math.min(rem, r2(all + d)); if (na > all) used.add(r.id); all = na;
    }
    return { lines, gross, lineDisc, all: r2(all), net: r2(gross - lineDisc - all), used: [...used] };
  },
  // Save karo: challan + ledger entries + rules ka "used" nishaan
  async create(st, month, due, session, calc, by) {
    const no = 'CH-' + pad(await DB.nextNo('challan'), 6), label = 'Fee ' + monthLabel(month);
    const c = await DB.insert('challans', { no, student_id: st.id, class_id: st.class_id, month, session_id: session && session.id, due_date: due,
      lines: calc.lines, gross: calc.gross, discount: calc.lineDisc, all_discount: calc.all, net: calc.net, late_fee: 0, paid: 0, rules_used: calc.used, by });
    const base = { student_id: st.id, date: today(), ref: no, challan_id: c.id };
    await DB.insert('ledger', { ...base, detail: `${label} (${calc.lines.map(l => l.head).join(', ')})`, head: 'Fee', kind: 'charge', debit: calc.gross, credit: 0 });
    if (calc.lineDisc + calc.all > 0) await DB.insert('ledger', { ...base, detail: `Discount ${label}`, head: 'Fee Discount', kind: 'discount', debit: 0, credit: r2(calc.lineDisc + calc.all) });
    await this.markRules(calc.used, session);
    return c;
  },
  async markRules(ids, session) {
    for (const id of ids) {
      const r = await DB.get('student_discounts', id); if (!r) continue;
      if (r.applies === 'once') await DB.update('student_discounts', id, { used_at: today() });
      if (r.applies === 'yearly') await DB.update('student_discounts', id, { last_session: session && session.id });
    }
  },
  async unmarkRules(ids) {
    for (const id of ids || []) { const r = await DB.get('student_discounts', id); if (r) await DB.update('student_discounts', id, { used_at: null, last_session: null }); }
  },
  challanCard(c, st, className, prev, S, pb) {
    return `<div class="receipt ${(S.receipt_size || 'A5').toLowerCase()} ${pb ? 'pb' : ''}">
      <div class="rc-head"><b>${esc(S.school_name)}</b><div>${esc(S.address || '')} ${esc(S.phone || '')}</div><div class="rc-title">Fee Challan - ${monthLabel(c.month)}</div></div>
      <div class="rc-meta"><span>Challan: <b>${esc(c.no)}</b></span><span>Due: <b>${fmtDate(c.due_date)}</b></span></div>
      <div class="rc-meta"><span>${esc(st.name)} s/o ${esc(st.father)}</span><span>${esc(st.gr_no)} / ${esc(className)}</span></div>
      <table><thead><tr><th>Fee head</th><th class="num">Amount</th><th class="num">Discount</th></tr></thead><tbody>
      ${c.lines.map(l => `<tr><td>${esc(l.head)}</td><td class="num">${money(l.gross, '')}</td><td class="num">${l.discount ? money(l.discount, '') : ''}</td></tr>`).join('')}
      ${c.all_discount ? `<tr><td>Extra discount</td><td></td><td class="num">${money(c.all_discount, '')}</td></tr>` : ''}
      <tr><td>Gross ${money(c.gross, S.currency)} / Discount ${money(c.discount + c.all_discount, S.currency)}</td><td colspan="2" class="num"><b>Net ${money(c.net, S.currency)}</b></td></tr>
      ${c.late_fee ? `<tr><td>Late fee</td><td colspan="2" class="num">${money(c.late_fee, S.currency)}</td></tr>` : ''}
      ${prev > 0 ? `<tr><td>Previous dues</td><td colspan="2" class="num">${money(prev, S.currency)}</td></tr>` : ''}
      <tr><td><b>Total payable</b></td><td colspan="2" class="num"><b>${money(outstanding(c) + Math.max(prev, 0), S.currency)}</b></td></tr></tbody></table>
      <div class="rc-sign"><span>Bank / Office copy</span><span>Signature / Stamp</span></div></div>`;
  }
};
