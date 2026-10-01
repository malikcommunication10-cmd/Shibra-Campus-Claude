# School ERP (Phase 1)

Sirf HTML + CSS + JS. Build tool nahi chahiye.

## GitHub Pages par lagane ka tareeqa
1. GitHub par naya repo banayein, is folder ki saari files upload karein (`index.html` root mein ho).
2. Repo > Settings > Pages > Source: `main` branch, `/ (root)` > Save.
3. Kuch der baad link khul jayega: `https://username.github.io/repo-name/`

## Demo login
admin / admin123 - accountant / acc123 - clerk / clerk123 - principal / principal123 (Settings mein badal lein)

## Structure
- `js/db.js` : data layer (abhi localStorage). Supabase/Google Sheet sirf yahan lagega.
- `js/app.js` : helpers, login/roles, modal, dual % / Rs. box (`dualLink`)
- `js/fees.js` : fee rates, discount rules, challan calculation (shared)
- `js/fees.js` : fee rates, discount rules, challan calculation (shared)
- `js/layout.js` : sidebar + topbar + menu
- `css/style.css` : mobile + desktop styles

## Supabase se connect karna
1. `supabase/schema.sql` chalayen, phir `supabase/patch_1.sql`.
2. Authentication > Users mein admin banayen: email `admin@school.local` (username `admin`), password apna, "Auto Confirm" on. Phir schema.sql ke aakhir wali `insert into profiles ...` query chalayen.
3. Authentication > Providers > Email: naye users app se banane hain to **Confirm email band** karein.
4. `js/config.js` mein `SUPABASE_URL` (Project Settings > API > Project URL) aur `SUPABASE_KEY` (usi page ki **Publishable key**, `sb_publishable_...`, ya purani anon key) likhein.
5. GitHub par `js/config.js` edit karke commit karein. 1-2 minute mein site update ho jati hai.

**Secret / service_role key GitHub par kabhi na dalein.** Publishable key public ho sakti hai, data ki hifazat Row Level Security (schema.sql) karti hai.
`config.js` khali ho to app demo mode (localStorage) mein chalti hai.

## Phase 3 mein
Fee Structure (class-wise amounts, heads, % / Rs. increment, late fee), Fee Collection (bulk generate, receive, partial, challan print, daybook), Fee Ledger (statement, defaulters, WhatsApp reminder).

## Phase 2 mein
Admission (enquiry, registration + receipt, admit), Students (list, profile, status, discounts, ledger, promote/passout).

## Phase 1 mein
Login, Dashboard, Classes & Sessions, Settings (school, numbering, rules, users, backup).
