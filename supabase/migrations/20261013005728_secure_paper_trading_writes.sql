-- Applied to Supabase project dlcncozasilbfsfwcjcq on 2026-10-13.
-- Protect paper trading rows from direct browser-side writes.
-- The RPCs are SECURITY DEFINER with fixed search_path and validate auth.uid().

alter function public.create_paper_order_atomic(text,numeric,numeric,numeric,numeric,text,text) security definer;
alter function public.create_paper_order_atomic(text,numeric,numeric,numeric,numeric,text,text) set search_path = public, pg_temp;
alter function public.close_paper_position_atomic(uuid,numeric,text) security definer;
alter function public.close_paper_position_atomic(uuid,numeric,text) set search_path = public, pg_temp;
alter function public.reset_paper_account_atomic() security definer;
alter function public.reset_paper_account_atomic() set search_path = public, pg_temp;
alter function public.tick_paper_positions_atomic() security definer;
alter function public.tick_paper_positions_atomic() set search_path = public, pg_temp;

drop policy if exists paper_accounts_update_own on public.paper_accounts;
drop policy if exists paper_orders_insert_own on public.paper_orders;
drop policy if exists paper_orders_update_own on public.paper_orders;
drop policy if exists "Users can delete their own paper orders" on public.paper_orders;
drop policy if exists paper_positions_insert_own on public.paper_positions;
drop policy if exists paper_positions_update_own on public.paper_positions;
drop policy if exists "Users can delete their own paper positions" on public.paper_positions;
drop policy if exists trade_journal_insert_own on public.trade_journal;
drop policy if exists trade_journal_update_own on public.trade_journal;
drop policy if exists "Users can delete their own trade journal" on public.trade_journal;

drop policy if exists paper_accounts_insert_own on public.paper_accounts;
create policy paper_accounts_insert_own
on public.paper_accounts
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and starting_balance = 10000
  and balance = 10000
);
