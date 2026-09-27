// Adresse Supabase et clé PUBLIQUE (« anon ») : la page en a besoin pour la connexion. Elles sont faites pour
// être visibles ; la protection vient de la connexion et des règles de sécurité de la table (supabase.sql).
import { point, variable } from "./_commun.js";

export function config(env = process.env) {
  return { supabaseUrl: variable("SUPABASE_URL", env), supabaseAnonKey: variable("SUPABASE_ANON_KEY", env) };
}

export default point(async () => config());
