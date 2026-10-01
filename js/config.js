/* =====================================================================
   config.js - Supabase ki settings (ye file GitHub par public hoti hai)

   SUPABASE_URL : Supabase > Project Settings > API > Project URL
   SUPABASE_KEY : usi page ki "Publishable key" (sb_publishable_...) ya purani "anon public" key.
                  Ye key public rakhna theek hai, data ki hifazat Row Level Security karti hai.

   !!! "secret" ya "service_role" key yahan KABHI na likhein, na GitHub par dalein. !!!

   Dono khali rakhein to app demo mode (browser ka localStorage) mein chalti hai.
   ===================================================================== */
window.APP_CONFIG = {
  SUPABASE_URL: 'https://fbwrtxobugyeygjkdeiv.supabase.co',
  SUPABASE_KEY: 'sb_publishable_SKZ1-BF8cVufWznEL7ojiA_kad8ik9B',
  LOGIN_DOMAIN: 'school.local'   // username ke peechay lagne wala email domain (Auth mein user isi email se bana ho)
};
