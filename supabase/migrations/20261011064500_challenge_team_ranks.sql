create function ml_challenge.team_results(sid uuid) returns jsonb language sql stable set search_path='' as $$
 with settings as (select settings from ml_challenge.sessions where id=sid), scores as (
  select t.id,t.name,count(p.id) members,coalesce(case when (select settings->>'teamScoring' from settings)='sum' then sum(p.score) else round(avg(p.score)) end,0) score,
   coalesce(case when (select settings->>'teamScoring' from settings)='sum' then sum(p.response_ms) else avg(p.response_ms) end,0) elapsed,min(p.joined_at) joined
  from ml_challenge.teams t left join ml_challenge.players p on p.team_id=t.id and not p.kicked where t.session_id=sid group by t.id,t.name
 ), ranked as (
  select id,name,members,score,case when (select settings->>'tieRule' from settings)='shared' then rank() over(order by score desc) else row_number() over(order by score desc,case when (select settings->>'tieRule' from settings)='speed' then elapsed else 0 end,joined,id) end rank from scores
 ) select coalesce(jsonb_agg(to_jsonb(ranked) order by name),'[]') from ranked;
$$;
revoke all on function ml_challenge.team_results(uuid) from public,anon,authenticated;
do $$ declare definition text;start_at integer;end_at integer;fragment text; begin
 select pg_get_functiondef('ml_challenge.snapshot(uuid,uuid,boolean)'::regprocedure) into definition;
 start_at:=strpos(definition,'select coalesce(jsonb_agg(jsonb_build_object(''id'',t.id');
 end_at:=strpos(definition,'into teams from ml_challenge.teams t where t.session_id=sid;')+length('into teams from ml_challenge.teams t where t.session_id=sid;');
 if start_at=0 or end_at<=start_at then raise exception 'Expected team summary block was not found';end if;
 fragment:=substring(definition from start_at for end_at-start_at);
 definition:=replace(definition,fragment,'teams:=ml_challenge.team_results(sid);');execute definition;
end $$;
notify pgrst,'reload schema';
