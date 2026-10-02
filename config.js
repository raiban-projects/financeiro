// =============================================================================
// Configuração do Supabase
//
// Pegue esses dois valores no painel do Supabase:
//   Project Settings > API (ou "Connect" no topo do projeto)
//     - Project URL           -> SUPABASE_URL
//     - anon / public key     -> SUPABASE_ANON_KEY
//
// A chave "anon" é feita pra ficar pública no site. Quem protege seus dados é
// o login + as regras de segurança (RLS) criadas pelo schema.sql.
// NUNCA coloque aqui a chave "service_role".
// =============================================================================
window.APP_CONFIG = {
  SUPABASE_URL: "https://imiwgoepwxtflxoxmzgb.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltaXdnb2Vwd3h0Zmx4b3htemdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5NDA2MTcsImV4cCI6MjEwNjUxNjYxN30.llcHhCUf5GlrEhep0utpzbitVs3kbNwcGSq2kKPijps",
};
