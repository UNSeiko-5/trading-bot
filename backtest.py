"""Simulation de la stratégie sur le passé (backtest).

Hypothèses, identiques à ce que fait le robot :
- le signal est calculé avec le prix de clôture du jour ;
- l'ordre est exécuté à l'OUVERTURE du lendemain (pas à la clôture du jour même) ;
- chaque achat ou vente coûte FRAIS (commission + écart achat/vente + glissement).
"""
import yfinance as yf

from strategie import FENETRE_SMA, SYMBOLE, calculer_sma, est_haussier

FRAIS = 0.0005  # 0,05 % par ordre
JOURS_PAR_AN = 252


def rendements_strategie(ouvertures, clotures, position, frais=FRAIS):
    """Rendement de chaque jour, pour une position (0 ou 1) prise à l'ouverture du jour."""
    position_veille = position.shift(1, fill_value=0)
    nuit = (ouvertures / clotures.shift(1) - 1).fillna(0)  # clôture de la veille -> ouverture
    journee = clotures / ouvertures - 1                     # ouverture -> clôture
    transactions = (position - position_veille).abs()
    return (1 + position_veille * nuit) * (1 + position * journee) - 1 - transactions * frais


def simuler(historique, fenetre=FENETRE_SMA, frais=FRAIS):
    """historique : tableau avec les colonnes Open et Close (prix ajustés des dividendes)."""
    df = historique[["Open", "Close"]].copy()
    df["sma"] = calculer_sma(df["Close"], fenetre)
    df = df[df["sma"].notna()].copy()  # on commence le jour où la moyenne existe

    signal = est_haussier(df["Close"], df["sma"]).astype(int)
    df["position"] = signal.shift(1, fill_value=0)  # détenue pendant la journée = signal de la veille
    df["transaction"] = (df["position"] - df["position"].shift(1, fill_value=0)).abs()
    df["strategie"] = rendements_strategie(df["Open"], df["Close"], df["position"], frais)
    df["buy_hold"] = df["Close"].pct_change().fillna(0)
    return df


def resume(rendements):
    courbe = (1 + rendements).cumprod()
    annees = len(rendements) / JOURS_PAR_AN
    return {
        "multiplicateur": courbe.iloc[-1],
        "rendement_annuel": courbe.iloc[-1] ** (1 / annees) - 1,
        "pire_chute": (courbe / courbe.cummax() - 1).min(),
    }


if __name__ == "__main__":
    historique = yf.Ticker(SYMBOLE).history(period="max", auto_adjust=True)
    if historique.empty:
        raise SystemExit("Aucune donnée reçue de Yahoo, réessaie plus tard.")

    df = simuler(historique)
    print(f"Période : {df.index[0].date()} -> {df.index[-1].date()} ({len(df) / JOURS_PAR_AN:.1f} ans)")
    for nom, colonne in [("Buy & Hold", "buy_hold"), ("Stratégie 200j", "strategie")]:
        r = resume(df[colonne])
        print(
            f"{nom:<15}: {r['multiplicateur']:6.2f}x | {r['rendement_annuel']:+.1%} par an"
            f" | pire chute : {r['pire_chute']:.1%}"
        )
    print(f"Transactions : {int(df['transaction'].sum())} | Temps investi : {df['position'].mean():.0%}")
