import yfinance as yf
import pandas as pd
import numpy as np

# 1. Télécharger 20 ans d'historique de SPY
data = yf.download('SPY', start='2004-01-01', auto_adjust=True)
df = data[['Close']].copy()
df.columns = ['price']

# 2. Règle des 200 jours
df['SMA200'] = df['price'].rolling(window=200).mean()
df['signal'] = np.where(df['price'] > df['SMA200'], 1, 0)
df['position'] = df['signal'].shift(1)  # Prise de position le lendemain

# 3. Calcul des rendements et des frais (0,05 % par ordre)
df['pct_change'] = df['price'].pct_change()
df['trades'] = df['position'].diff().abs()
frais = 0.0005

df['strategy_return'] = (df['position'] * df['pct_change']) - (df['trades'] * frais)
df['buy_hold_return'] = df['pct_change']

# 4. Performance cumulée et Drawdown
df['cum_strategy'] = (1 + df['strategy_return']).cumprod()
df['cum_bh'] = (1 + df['buy_hold_return']).cumprod()

# Calcul du Drawdown maximal (la pire chute depuis un sommet)
def max_drawdown(cum_series):
    peak = cum_series.cummax()
    dd = (cum_series - peak) / peak
    return dd.min() * 100

dd_strategy = max_drawdown(df['cum_strategy'])
dd_bh = max_drawdown(df['cum_bh'])

print(f"Performance Buy & Hold     : {df['cum_bh'].iloc[-1]:.2f}x | Pire chute : {dd_bh:.1f} %")
print(f"Performance Stratégie 200j : {df['cum_strategy'].iloc[-1]:.2f}x | Pire chute : {dd_strategy:.1f} %")
print(f"Nombre total de transactions : {int(df['trades'].sum())}")
