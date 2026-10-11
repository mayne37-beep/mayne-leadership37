create or replace function ml_challenge.report(sid uuid) returns jsonb language plpgsql set search_path='' as $$
declare s ml_challenge.sessions;rs jsonb;ps jsonb;qs jsonb;result jsonb;graded integer;participants integer;
begin
 select * into s from ml_challenge.sessions where id=sid;
 select count(*) into participants from ml_challenge.players where session_id=sid and not kicked;
 select count(*) into graded from jsonb_array_elements(s.snapshot->'questions') with ordinality x(q,n) where q->>'type' in ('choice','truefalse','text','order','image','number','pin') and (s.challenge or n<=s.current+1);
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'player',p.nickname,'question',r.question_index+1,'attempt',r.attempt,'answer',r.answer,'credit',r.credit,'points',r.points,'elapsed',r.elapsed_ms,'pending',r.pending)),'[]') into rs from ml_challenge.submissions r join ml_challenge.players p on p.id=r.player_id where r.session_id=sid and not p.kicked;
 select coalesce(jsonb_agg(jsonb_build_object('nickname',nickname,'score',score,'team',team_id,'correct',correct,'finished',finished)),'[]') into ps from ml_challenge.players where session_id=sid and not kicked;
 select coalesce(jsonb_agg(jsonb_build_object(
  'index',n,'text',q->>'text','type',q->>'type','choices',q->'choices',
  'responses',(select count(*) from ml_challenge.submissions r join ml_challenge.players p on p.id=r.player_id where r.session_id=sid and r.question_index=n-1 and not p.kicked and r.attempt=p.attempt),
  'accuracy',case when q->>'type' in ('choice','truefalse','text','order','image','number','pin') and (s.challenge or n<=s.current+1) then (select round(100*coalesce(sum(greatest(0,r.credit)),0)/nullif(participants,0),1) from ml_challenge.submissions r join ml_challenge.players p on p.id=r.player_id where r.session_id=sid and r.question_index=n-1 and r.attempt=p.attempt and not p.kicked) else null end,
  'averageMs',(select round(avg(r.elapsed_ms)) from ml_challenge.submissions r join ml_challenge.players p on p.id=r.player_id where r.session_id=sid and r.question_index=n-1 and r.attempt=p.attempt and not p.kicked),
  'responseSummary',(select coalesce(jsonb_agg(jsonb_build_object('answer',grouped.answer,'count',grouped.count) order by grouped.count desc),'[]') from (select case when q->>'type'='cloud' then to_jsonb(lower(trim(r.answer#>>'{}'))) else r.answer end answer,count(*) from ml_challenge.submissions r join ml_challenge.players p on p.id=r.player_id where r.session_id=sid and r.question_index=n-1 and r.attempt=p.attempt and not p.kicked group by 1) grouped)
 ) order by n),'[]') into qs from jsonb_array_elements(s.snapshot->'questions') with ordinality x(q,n);
 result:=jsonb_build_object('id',s.id,'gameId',s.game_id,'title',s.snapshot->>'title','created',s.created_at,'ended',s.ended_at,'mode',s.settings->>'mode','anonymous',coalesce((s.settings->>'anonymous')::boolean,false),'participants',participants,'averageScore',(select coalesce(round(avg(score)),0) from ml_challenge.players where session_id=sid and not kicked),'highScore',(select coalesce(max(score),0) from ml_challenge.players where session_id=sid and not kicked),
  'accuracy',(select round(100*coalesce(sum(greatest(0,r.credit)),0)/nullif(participants*graded,0),1) from ml_challenge.submissions r join ml_challenge.players p on p.id=r.player_id where r.session_id=sid and r.attempt=p.attempt and not p.kicked),
  'questions',qs,'players',ps,'submissions',rs,'teams',(ml_challenge.snapshot(sid,null,true))->'teams',
  'reviewQueue',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'question',r.question_index+1,'answer',r.answer,'player',case when coalesce((s.settings->>'anonymous')::boolean,false) then null else p.nickname end)),'[]') from ml_challenge.submissions r join ml_challenge.players p on p.id=r.player_id where r.session_id=sid and r.pending and r.attempt=p.attempt and not p.kicked));
 if coalesce((s.settings->>'anonymous')::boolean,false) then result:=result-'players'-'submissions';end if;
 return result;
end $$;
notify pgrst,'reload schema';
