// Outils communs des fonctions Vercel (les fichiers qui commencent par « _ » ne deviennent pas des adresses web).
import { emailAutorise } from "../logique.js";

// Compte FICTIF écrit en dur : cette page ne peut pas toucher un compte réel sans changer ce code.
export const ALPACA_TRADING = "https://paper-api.alpaca.markets";
export const ALPACA_DONNEES = "https://data.alpaca.markets";

export class ErreurHttp extends Error {
  constructor(statut, message) {
    super(message);
    this.statut = statut;
  }
}

/** Variable secrète de Vercel (Settings > Environment Variables). Jamais écrite dans le code. */
export function variable(nom, env = process.env) {
  const valeur = env[nom];
  if (!valeur) throw new ErreurHttp(500, `${nom} manquante dans les réglages de Vercel`);
  return valeur;
}

/** Vérifie que la demande vient de TOI : jeton de connexion Supabase valide ET e-mail autorisé. */
export async function verifierUtilisateur(req, fetcher = fetch, env = process.env) {
  const entete = req.headers?.authorization ?? "";
  const jeton = entete.startsWith("Bearer ") ? entete.slice(7).trim() : "";
  if (!jeton) throw new ErreurHttp(401, "connexion requise");
  const reponse = await fetcher(`${variable("SUPABASE_URL", env).replace(/\/$/, "")}/auth/v1/user`, {
    headers: { apikey: variable("SUPABASE_ANON_KEY", env), Authorization: `Bearer ${jeton}` },
  });
  if (!reponse.ok) throw new ErreurHttp(401, "session expirée : reconnecte-toi");
  const utilisateur = await reponse.json();
  if (!emailAutorise(utilisateur.email, variable("ALLOWED_EMAIL", env))) throw new ErreurHttp(403, "accès refusé");
  return utilisateur.email;
}

/** Appel à l'API Alpaca avec les clés du compte fictif. */
export async function alpaca(chemin, { base = ALPACA_TRADING, fetcher = fetch, env = process.env } = {}) {
  const reponse = await fetcher(`${base}${chemin}`, {
    headers: {
      "APCA-API-KEY-ID": variable("ALPACA_API_KEY", env),
      "APCA-API-SECRET-KEY": variable("ALPACA_SECRET_KEY", env),
    },
  });
  if (!reponse.ok) {
    const texte = await reponse.text().catch(() => "");
    throw new ErreurHttp(502, `Alpaca a répondu ${reponse.status} : ${texte.slice(0, 200)}`);
  }
  return reponse.json();
}

/** Transforme une fonction (req) -> données en fonction Vercel : réponse JSON, jamais mise en cache. */
export function point(fonction) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      res.status(200).json(await fonction(req));
    } catch (erreur) {
      const statut = erreur instanceof ErreurHttp ? erreur.statut : 500;
      if (statut === 500) console.error(erreur);
      res.status(statut).json({ erreur: erreur.message });
    }
  };
}
