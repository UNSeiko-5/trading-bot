// Tout le compte Alpaca en direct : valeur, positions, ordres, historique, horloge du marché.
import { alpaca, point, verifierUtilisateur } from "./_commun.js";

export async function donneesCompte(options = {}) {
  const [compte, positions, ordres, annee, jour, horloge] = await Promise.all([
    alpaca("/v2/account", options),
    alpaca("/v2/positions", options),
    alpaca("/v2/orders?status=all&limit=200&direction=desc", options),
    alpaca("/v2/account/portfolio/history?period=1A&timeframe=1D", options),
    alpaca("/v2/account/portfolio/history?period=1D&timeframe=5Min&intraday_reporting=continuous", options),
    alpaca("/v2/clock", options),
  ]);
  return { compte, positions, ordres, historique: { annee, jour }, horloge, heure: new Date().toISOString() };
}

export function creer(options = {}) {
  return point(async (req) => {
    await verifierUtilisateur(req, options.fetcher, options.env);
    return donneesCompte(options);
  });
}

export default creer();
