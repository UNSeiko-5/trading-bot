// Bougies d'un actif du panier (en jours sur ~1 an, ou en heures sur 30 jours), données gratuites d'Alpaca.
import { UNIVERS, estCrypto, versAlpaca } from "../logique.js";
import { ALPACA_DONNEES, ErreurHttp, alpaca, point, verifierUtilisateur } from "./_commun.js";

const ECHELLES = { jour: { timeframe: "1Day", jours: 400 }, heure: { timeframe: "1Hour", jours: 30 } };

export function adresseBarres(symbole, echelle, maintenant = new Date()) {
  if (!UNIVERS.includes(symbole)) throw new ErreurHttp(400, `actif inconnu : ${symbole}`);
  const reglage = ECHELLES[echelle];
  if (!reglage) throw new ErreurHttp(400, `échelle inconnue : ${echelle}`);
  const debut = new Date(maintenant.getTime() - reglage.jours * 86_400_000).toISOString();
  const commun = `symbols=${encodeURIComponent(versAlpaca(symbole))}&timeframe=${reglage.timeframe}` +
    `&start=${encodeURIComponent(debut)}&limit=10000`;
  return estCrypto(symbole)
    ? `/v1beta3/crypto/us/bars?${commun}`
    : `/v2/stocks/bars?${commun}&adjustment=all&feed=iex`;
}

export async function barres(symbole, echelle, options = {}) {
  const reponse = await alpaca(adresseBarres(symbole, echelle), { ...options, base: ALPACA_DONNEES });
  return { symbole, echelle, barres: reponse.bars?.[versAlpaca(symbole)] ?? [] };
}

export function creer(options = {}) {
  return point(async (req) => {
    await verifierUtilisateur(req, options.fetcher, options.env);
    return barres(String(req.query?.symbole ?? ""), String(req.query?.echelle ?? "jour"), options);
  });
}

export default creer();
