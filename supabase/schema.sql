-- Rode este arquivo no Supabase: painel do projeto -> SQL Editor -> New query -> colar -> Run.
-- Cria a tabela de canais favoritos, onde cada usuário só enxerga e mexe nos próprios canais.

create table if not exists public.channels (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  channel_id text        not null check (channel_id ~ '^UC[A-Za-z0-9_-]{22}$'),
  title      text        not null,
  avatar     text,
  created_at timestamptz not null default now(),
  primary key (user_id, channel_id)
);

-- Segurança por linha (RLS): sem isso qualquer pessoa com a chave pública leria tudo.
alter table public.channels enable row level security;

drop policy if exists "ler os proprios canais" on public.channels;
create policy "ler os proprios canais"
  on public.channels for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "adicionar os proprios canais" on public.channels;
create policy "adicionar os proprios canais"
  on public.channels for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "atualizar os proprios canais" on public.channels;
create policy "atualizar os proprios canais"
  on public.channels for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "remover os proprios canais" on public.channels;
create policy "remover os proprios canais"
  on public.channels for delete
  to authenticated
  using ((select auth.uid()) = user_id);
