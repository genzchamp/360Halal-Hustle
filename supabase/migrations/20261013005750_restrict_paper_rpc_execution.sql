-- Applied to Supabase project dlcncozasilbfsfwcjcq on 2026-10-13.
-- RPCs must be callable by signed-in users only; all functions validate auth.uid().

revoke all on function public.create_paper_order_atomic(text,numeric,numeric,numeric,numeric,text,text) from public, anon;
revoke all on function public.close_paper_position_atomic(uuid,numeric,text) from public, anon;
revoke all on function public.reset_paper_account_atomic() from public, anon;
revoke all on function public.tick_paper_positions_atomic() from public, anon;

grant execute on function public.create_paper_order_atomic(text,numeric,numeric,numeric,numeric,text,text) to authenticated;
grant execute on function public.close_paper_position_atomic(uuid,numeric,text) to authenticated;
grant execute on function public.reset_paper_account_atomic() to authenticated;
grant execute on function public.tick_paper_positions_atomic() to authenticated;
