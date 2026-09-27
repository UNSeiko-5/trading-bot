-- Base de données de la page de suivi (à coller UNE fois dans Supabase > SQL Editor > New query > Run).
-- AVANT de lancer : dans la règle de sécurité (étape 2), remplace TON_EMAIL@exemple.fr par ton e-mail de connexion.

-- 1. Le rapport du soir du robot (écrit par robot_v3.py avec la clé de service, depuis GitHub)
create table if not exists public.rapports (
  id bigint generated always as identity primary key,
  cree_le timestamptz not null default now(),
  seance date not null,
  statut text not null,
  capital double precision,
  cash double precision,
  chute double precision,
  perte_jour double precision,
  multiplicateur double precision,
  securite jsonb,
  actifs jsonb,
  ordres jsonb,
  remarques jsonb,
  message text
);
create index if not exists rapports_cree_le on public.rapports (cree_le desc);

-- 2. Sécurité : personne ne lit ni n'écrit sans autorisation. Seul TON e-mail, connecté, peut lire.
--    (Le robot écrit avec la clé de service, qui passe outre ces règles ; elle reste secrète dans GitHub.)
alter table public.rapports enable row level security;
drop policy if exists "lecture par le proprietaire" on public.rapports;
create policy "lecture par le proprietaire" on public.rapports
  for select to authenticated
  using (lower(auth.jwt() ->> 'email') = lower('TON_EMAIL@exemple.fr'));

-- 3. Temps réel : la page est prévenue dès qu'un nouveau rapport arrive
do $$
begin
  alter publication supabase_realtime add table public.rapports;
exception when duplicate_object then null;
end $$;

-- Vérification (doit afficher 1 ligne avec rowsecurity = true) :
select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename = 'rapports';
-- Rappel : remplace aussi TON_EMAIL@exemple.fr dans ALLOWED_EMAIL sur Vercel (même adresse).
