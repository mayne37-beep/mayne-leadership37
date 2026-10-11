create or replace function ml_challenge.snapshot(sid uuid,pid uuid default null,host boolean default false) returns jsonb language plpgsql set search_path='' as $$
declare s ml_challenge.sessions;p ml_challenge.players;q jsonb;qi integer;mine ml_challenge.submissions;players jsonb;lb jsonb;teams jsonb;responses jsonb;aggregate jsonb;show_result boolean;out_q jsonb;total integer;answered integer;
begin
 select * into s from ml_challenge.sessions where id=sid;
 if not found then raise exception 'Session not found' using errcode='P0002';end if;
 if pid is not null then select * into p from ml_challenge.players where id=pid and session_id=sid and not kicked;if not found then raise exception 'You have been removed from this session' using errcode='42501';end if;end if;
 qi:=case when s.challenge and not host then p.progress else s.current end;
 q:=case when qi>=0 then s.snapshot->'questions'->qi end;
 select * into mine from ml_challenge.submissions where session_id=sid and player_id=pid and question_index=qi and attempt=p.attempt;
 show_result:=host or (s.challenge and mine.id is not null) or (not s.challenge and s.stage in ('reveal','ended'));
 out_q:=ml_challenge.public_question(q,coalesce(pid::text,sid::text)||qi::text,coalesce((s.settings->>'shuffleAnswers')::boolean,false));
 if show_result and coalesce((s.settings->>'reveal')::boolean,true) then out_q:=out_q||jsonb_build_object('correct',q->'correct','acceptable',q->'acceptable','number',q->'number','tolerance',q->'tolerance','target',q->'target');end if;
 if show_result and coalesce((s.settings->>'explanations')::boolean,true) then out_q:=out_q||jsonb_build_object('explanation',q->>'explanation');end if;
 select count(*) into total from ml_challenge.players where session_id=sid and not kicked;
 select count(*) into answered from ml_challenge.submissions where session_id=sid and question_index=qi and attempt=1;
 if host then select coalesce(jsonb_agg(jsonb_build_object('id',id,'nickname',nickname,'team',team_id,'score',score,'connected',last_seen>clock_timestamp()-interval '35 seconds','finished',finished) order by joined_at),'[]') into players from ml_challenge.players where session_id=sid and not kicked;end if;
 if (host or (not s.challenge and s.stage in ('reveal','ended'))) and coalesce((s.settings->>'leaderboard')::boolean,true) and s.settings->>'mode'<>'discussion' then
 select coalesce(jsonb_agg(z order by rank),'[]') into lb from(select id,nickname,score,team_id,case when s.settings->>'tieRule'='shared' then rank() over(order by score desc) else row_number() over(order by score desc,case when s.settings->>'tieRule'='speed' then response_ms else 0 end,joined_at,id) end as rank from ml_challenge.players where session_id=sid and not kicked) z;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'members',(select count(*) from ml_challenge.players p2 where p2.team_id=t.id and not p2.kicked),'score',coalesce((select case when s.settings->>'teamScoring'='sum' then sum(p3.score) else round(avg(p3.score)) end from ml_challenge.players p3 where p3.team_id=t.id and not p3.kicked),0)) order by t.name),'[]') into teams from ml_challenge.teams t where t.session_id=sid;
 if host or (show_result and not s.challenge) then
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'player',case when coalesce((s.settings->>'anonymous')::boolean,false) then null else p2.nickname end,'answer',r.answer,'credit',r.credit,'points',r.points,'elapsed',r.elapsed_ms,'pending',r.pending,'highlighted',r.highlighted) order by r.created_at),'[]') into responses from ml_challenge.submissions r join ml_challenge.players p2 on p2.id=r.player_id where r.session_id=sid and r.question_index=qi and r.attempt=1 and not p2.kicked;
 -- Other students never receive individual answer bodies or names.
 if not host then select coalesce(jsonb_agg(jsonb_build_object('answer',r->'answer','highlighted',r->'highlighted')),'[]') into responses from jsonb_array_elements(responses) r;end if;
 end if;
 return jsonb_build_object('id',s.id,'pin',s.pin,'title',s.snapshot->>'title','stage',case when s.challenge and not host then case when p.finished then 'ended' when mine.id is not null then 'reveal' else 'question' end else s.stage end,'index',qi,'count',jsonb_array_length(s.snapshot->'questions'),'version',s.version,'question',out_q,'settings',s.settings,'deadline',case when s.challenge then null else s.deadline end,'remaining',s.remaining,'serverTime',floor(extract(epoch from clock_timestamp())*1000),'locked',s.locked,'expires',s.expires_at,'challenge',s.challenge,'attempts',s.attempts,'total',total,'answered',answered,'players',players,'leaderboard',lb,'teams',case when host or s.stage in ('reveal','ended','lobby') then teams else '[]'::jsonb end,'responses',responses,'me',case when pid is null then null else jsonb_build_object('id',p.id,'nickname',p.nickname,'score',p.score-case when not show_result then coalesce(mine.points,0) else 0 end,'streak',case when show_result then p.streak else null end,'team',p.team_id,'attempt',p.attempt,'finished',p.finished,'rank',case when show_result then (select rk from (select id,case when s.settings->>'tieRule'='shared' then rank() over(order by score desc) else row_number() over(order by score desc,case when s.settings->>'tieRule'='speed' then response_ms else 0 end,joined_at,id) end rk from ml_challenge.players where session_id=sid and not kicked) ranked where id=p.id) end) end,'submission',case when mine.id is null then null else jsonb_build_object('submitted',true,'pending',mine.pending,'answer',mine.answer,'credit',case when show_result then mine.credit end,'points',case when show_result then mine.points end) end);
end $$;

create or replace function ml_challenge.report(sid uuid) returns jsonb language plpgsql set search_path='' as $$
declare s ml_challenge.sessions;rs jsonb;ps jsonb;qs jsonb;result jsonb;
begin
 select * into s from ml_challenge.sessions where id=sid;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'player',p.nickname,'question',r.question_index+1,'attempt',r.attempt,'answer',r.answer,'credit',r.credit,'points',r.points,'elapsed',r.elapsed_ms,'pending',r.pending)),'[]') into rs from ml_challenge.submissions r join ml_challenge.players p on p.id=r.player_id where r.session_id=sid and not p.kicked;
 select coalesce(jsonb_agg(jsonb_build_object('nickname',nickname,'score',score,'team',team_id,'correct',correct,'finished',finished)),'[]') into ps from ml_challenge.players where session_id=sid and not kicked;
 select coalesce(jsonb_agg(jsonb_build_object('index',n,'text',q->>'text','type',q->>'type','responses',(select count(*) from ml_challenge.submissions where session_id=sid and question_index=n-1),'accuracy',case when q->>'type' in ('choice','truefalse','text','order','image','number','pin') and (s.challenge or n<=s.current+1) then (select round(100*coalesce(sum(greatest(0,credit)),0)/nullif((select count(*) from ml_challenge.players where session_id=sid and not kicked),0),1) from ml_challenge.submissions where session_id=sid and question_index=n-1 and attempt=1) else null end,'averageMs',(select round(avg(elapsed_ms)) from ml_challenge.submissions where session_id=sid and question_index=n-1)) order by n),'[]') into qs from jsonb_array_elements(s.snapshot->'questions') with ordinality x(q,n);
 result:=jsonb_build_object('id',s.id,'gameId',s.game_id,'title',s.snapshot->>'title','created',s.created_at,'ended',s.ended_at,'mode',s.settings->>'mode','anonymous',coalesce((s.settings->>'anonymous')::boolean,false),'participants',jsonb_array_length(ps),'averageScore',(select coalesce(round(avg(score)),0) from ml_challenge.players where session_id=sid and not kicked),'highScore',(select coalesce(max(score),0) from ml_challenge.players where session_id=sid and not kicked),'accuracy',(select round(100*coalesce(sum(greatest(0,credit)),0)/nullif((select count(*) from ml_challenge.players where session_id=sid and not kicked)*(select count(*) from jsonb_array_elements(s.snapshot->'questions') with ordinality x(q,n) where q->>'type' in ('choice','truefalse','text','order','image','number','pin') and (s.challenge or n<=s.current+1)),0),1) from ml_challenge.submissions where session_id=sid and attempt=1),'questions',qs,'players',ps,'submissions',rs,'teams',(ml_challenge.snapshot(sid,null,true))->'teams');
 if coalesce((s.settings->>'anonymous')::boolean,false) then result:=result-'players'-'submissions';end if;
 return result;
end $$;

create or replace function ml_challenge.gateway(p_key text,p_owner uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s ml_challenge.sessions;g ml_challenge.games;p ml_challenge.players;r ml_challenge.submissions;q jsonb;cfg jsonb;result jsonb;target uuid;pid uuid;tid uuid;doc jsonb;code text;token text;owner_ok boolean;qi integer;amt numeric;ms numeric;pts integer;team_n integer;oldv integer;n integer;k text;b ml_challenge.rate_limits;
begin
 if length(coalesce(p_key,''))<>64 or not exists(select 1 from ml_challenge.gateway_keys where key_hash=encode(sha256(convert_to(p_key,'UTF8')),'hex')) then raise exception 'Access denied' using errcode='42501';end if;
 owner_ok:=p_owner is not null and exists(select 1 from ml_challenge.instructors where id=p_owner);
 if p_action in ('join','lookup') then
  k:='join:'||coalesce(p_payload->>'ip','unknown');
  insert into ml_challenge.rate_limits(key,count) values(k,1) on conflict(key) do update set count=case when ml_challenge.rate_limits.bucket<clock_timestamp()-interval '1 minute' then 1 else ml_challenge.rate_limits.count+1 end,bucket=case when ml_challenge.rate_limits.bucket<clock_timestamp()-interval '1 minute' then clock_timestamp() else ml_challenge.rate_limits.bucket end returning * into b;
  if b.count>220 then return jsonb_build_object('error','Too many joining requests. Try again in a minute.','status',429);end if;
 end if;
 if p_action in ('games','bank','settings','sessions') then
  if not owner_ok then raise exception 'Instructor access required' using errcode='42501';end if;
  if p_action='games' then select coalesce(jsonb_agg(jsonb_build_object('id',id,'data',draft,'version',version,'published',published is not null,'archived',archived,'template',template,'updated',updated_at) order by updated_at desc),'[]') into result from ml_challenge.games where owner=p_owner;return result;
  elsif p_action='bank' then select coalesce(jsonb_agg(jsonb_build_object('id',id,'question',question)),'[]') into result from ml_challenge.bank where owner=p_owner;return result;
  elsif p_action='settings' then return (select settings from ml_challenge.instructors where id=p_owner);
  else
   delete from ml_challenge.sessions where owner=p_owner and coalesce(ended_at,expires_at)<clock_timestamp()-coalesce((select (settings->>'retentionDays')::integer from ml_challenge.instructors where id=p_owner),90)*interval '1 day';
   delete from ml_challenge.rate_limits where bucket<clock_timestamp()-interval '1 day';
   select coalesce(jsonb_agg(jsonb_build_object('id',id,'pin',pin,'title',snapshot->>'title','gameId',game_id,'stage',stage,'challenge',challenge,'expires',expires_at,'created',created_at,'participants',(select count(*) from ml_challenge.players where session_id=s.id and not kicked)) order by created_at desc),'[]') into result from ml_challenge.sessions s where owner=p_owner;return result;end if;
 end if;
 if p_action='settings-save' then if not owner_ok then raise exception 'Instructor access required' using errcode='42501';end if;update ml_challenge.instructors set settings=p_payload->'settings' where id=p_owner;return '{}'::jsonb;end if;
 if p_action='bank-add' then if not owner_ok then raise exception 'Instructor access required' using errcode='42501';end if;insert into ml_challenge.bank(owner,question) values(p_owner,p_payload->'question') returning id into target;return jsonb_build_object('id',target);end if;
 if p_action='bank-delete' then if not owner_ok then raise exception 'Instructor access required' using errcode='42501';end if;delete from ml_challenge.bank where id=(p_payload->>'id')::uuid and owner=p_owner;return '{}'::jsonb;end if;
 if p_action in ('game-create','game-get','game-save','game-publish','game-archive','game-delete') then
  if not owner_ok then raise exception 'Instructor access required' using errcode='42501';end if;
  target:=(p_payload->>'id')::uuid;
  if p_action='game-create' then
   doc:=p_payload->'data';insert into ml_challenge.games(id,owner,draft,template) values(target,p_owner,doc,coalesce((p_payload->>'template')::boolean,false)) returning * into g;
  else
   select * into g from ml_challenge.games where id=target and owner=p_owner for update;if not found then raise exception 'Game not found' using errcode='P0002';end if;
   if p_action='game-delete' then delete from ml_challenge.games where id=target;return '{}'::jsonb;end if;
   if p_action in ('game-save','game-publish') then
    if coalesce((p_payload->>'version')::integer,-1)<>g.version then raise exception 'Game changed in another tab. Export your draft before reloading.' using errcode='P0001';end if;
    update ml_challenge.games set draft=p_payload->'data',published=case when p_action='game-publish' then p_payload->'data' else published end,version=version+1,updated_at=clock_timestamp() where id=target returning * into g;
   elsif p_action='game-archive' then update ml_challenge.games set archived=coalesce((p_payload->>'archived')::boolean,true) where id=target returning * into g;end if;
  end if;
  return jsonb_build_object('id',g.id,'data',g.draft,'version',g.version,'published',g.published is not null,'template',g.template,'archived',g.archived);
 end if;
 if p_action='host' then
  if not owner_ok then raise exception 'Instructor access required' using errcode='42501';end if;
  select * into g from ml_challenge.games where id=(p_payload->>'game')::uuid and owner=p_owner and not archived;if not found or g.published is null then raise exception 'Publish this game before hosting it';end if;
  doc:=g.published;cfg:=p_payload->'settings';
  if coalesce((cfg->>'shuffleQuestions')::boolean,false) then select jsonb_agg(q order by random()) into result from jsonb_array_elements(doc->'questions') q;doc:=jsonb_set(doc,'{questions}',result);end if;
  for n in 1..25 loop
   begin
    code:=lpad(floor(random()*1000000)::integer::text,6,'0');
    insert into ml_challenge.sessions(owner,game_id,pin,snapshot,settings,challenge,attempts,expires_at) values(p_owner,g.id,code,doc,cfg,cfg->>'mode' in ('challenge','practice'),greatest(1,least(20,coalesce((p_payload->>'attempts')::integer,1))),case when cfg->>'mode' in ('challenge','practice') then coalesce((p_payload->>'deadline')::timestamptz,clock_timestamp()+interval '30 days') else clock_timestamp()+interval '1 day' end) returning * into s;exit;
   exception when unique_violation then if n=25 then raise exception 'Could not create a PIN. Try again.';end if;end;
  end loop;
  if cfg->>'mode'='team' then
   team_n:=greatest(2,least(20,coalesce((cfg->>'teams')::integer,4)));
   for n in 1..team_n loop insert into ml_challenge.teams(session_id,name) values(s.id,'Team '||n);end loop;
  end if;
  return ml_challenge.snapshot(s.id,null,true);
 end if;
 if p_action='lookup' then select * into s from ml_challenge.sessions where pin=p_payload->>'pin' and expires_at>clock_timestamp() and stage<>'ended';if not found then raise exception 'No active game has this PIN' using errcode='P0002';end if;return jsonb_build_object('title',s.snapshot->>'title','id',s.id,'anonymous',s.settings->'anonymous');end if;
 if p_action='join' then
  select * into s from ml_challenge.sessions where pin=p_payload->>'pin' for update;
  if not found then raise exception 'Check the six-digit PIN' using errcode='P0002';end if;
  token:=p_payload->>'token';if token!~'^[a-f0-9]{64}$' then raise exception 'Invalid participant key';end if;
  select * into p from ml_challenge.players where session_id=s.id and token_hash=encode(sha256(convert_to(token,'UTF8')),'hex');
  if p.id is null then
   if s.locked or s.expires_at<=clock_timestamp() or s.stage='ended' or (s.stage<>'lobby' and not coalesce((s.settings->>'lateJoin')::boolean,true)) then raise exception 'Joining is closed for this game';end if;
   select count(*) into n from ml_challenge.players where session_id=s.id;
   if n>=150 then raise exception 'This game has reached its 150-participant safety limit';end if;
   code:=trim(p_payload->>'nickname');if coalesce((s.settings->>'anonymous')::boolean,false) then code:='Participant '||(n+1);end if;
   if code is null or length(code) not between 2 and 40 or code~'[[:cntrl:]]' then raise exception 'Use a nickname with 2–40 characters';end if;
   if s.settings->>'mode'='team' and s.settings->>'teamAssignment'<>'manual' then select t.id into tid from ml_challenge.teams t where session_id=s.id order by (select count(*) from ml_challenge.players p2 where p2.team_id=t.id and not kicked),t.name limit 1;end if;
   insert into ml_challenge.players(session_id,token_hash,nickname,team_id) values(s.id,encode(sha256(convert_to(token,'UTF8')),'hex'),code,tid) returning * into p;
   perform realtime.send('{"kind":"lobby"}'::jsonb,'changed','lcs:'||s.id::text,false);
  elsif p.kicked then raise exception 'This participant has been removed' using errcode='42501';end if;
  update ml_challenge.players set last_seen=clock_timestamp() where id=p.id;
  return ml_challenge.snapshot(s.id,p.id,false);
 end if;
 target:=(p_payload->>'id')::uuid;
 if p_action in ('host-snapshot','control','report','review','session-delete') then
  if not owner_ok then raise exception 'Instructor access required' using errcode='42501';end if;
  select * into s from ml_challenge.sessions where id=target and owner=p_owner;
  if not found then raise exception 'Session not found' using errcode='P0002';end if;
  if p_action='host-snapshot' then perform ml_challenge.tick(target);return ml_challenge.snapshot(target,null,true);end if;
  if p_action='report' then return ml_challenge.report(target);end if;
  if p_action='session-delete' then delete from ml_challenge.sessions where id=target;return '{}'::jsonb;end if;
  if p_action='review' then
   select * into r from ml_challenge.submissions where id=(p_payload->>'submission')::uuid and session_id=target for update;
   if not found then raise exception 'Submission not found';end if;
   if p_payload ? 'highlight' then update ml_challenge.submissions set highlighted=(p_payload->>'highlight')::boolean where id=r.id;
   else
    if not r.pending then raise exception 'This answer has already been graded';end if;
    amt:=(p_payload->>'credit')::numeric;if amt not between 0 and 1 then raise exception 'Credit must be between 0 and 1';end if;
    q:=s.snapshot->'questions'->r.question_index;pts:=ml_challenge.points(q,s.settings,amt,r.elapsed_ms,0);
    update ml_challenge.submissions set credit=amt,points=pts,pending=false where id=r.id;
    update ml_challenge.players set score=score+pts,correct=correct+amt where id=r.player_id and attempt=r.attempt;
   end if;
   perform realtime.send('{"kind":"state"}'::jsonb,'changed','lcs:'||target::text,false);return ml_challenge.snapshot(target,null,true);
  end if;
  select * into s from ml_challenge.sessions where id=target for update;
  k:=p_payload->>'command';
  if k in ('start','next','reveal','pause','resume') and coalesce((p_payload->>'version')::integer,-1)<>s.version then raise exception 'Session state changed. Refresh and try again.' using errcode='P0001';end if;
  if k='start' and s.stage='lobby' and not s.challenge then perform ml_challenge.advance(target);
  elsif k='next' and s.stage='reveal' then perform ml_challenge.advance(target);
  elsif k='reveal' and s.stage in ('question','paused') then update ml_challenge.sessions set stage='reveal',reveal_at=clock_timestamp(),version=version+1 where id=target;
  elsif k='pause' and s.stage='question' then update ml_challenge.sessions set stage='paused',remaining=case when deadline is null then null else greatest(0,extract(epoch from(deadline-clock_timestamp()))) end,elapsed=elapsed+greatest(0,extract(epoch from(clock_timestamp()-started_at))),version=version+1 where id=target;
  elsif k='resume' and s.stage='paused' then update ml_challenge.sessions set stage='question',started_at=clock_timestamp(),deadline=case when remaining is null then null else clock_timestamp()+remaining*interval '1 second' end,version=version+1 where id=target;
  elsif k='end' then update ml_challenge.sessions set stage='ended',ended_at=clock_timestamp(),version=version+1 where id=target;
  elsif k='lock' then update ml_challenge.sessions set locked=(p_payload->>'locked')::boolean where id=target;
  elsif k='kick' then update ml_challenge.players set kicked=true where id=(p_payload->>'player')::uuid and session_id=target;
  elsif k='assign' then
   tid:=(p_payload->>'team')::uuid;if not exists(select 1 from ml_challenge.teams where id=tid and session_id=target) then raise exception 'Invalid team';end if;
   update ml_challenge.players set team_id=tid where id=(p_payload->>'player')::uuid and session_id=target;
  else raise exception 'This control is not available in the current stage';end if;
  perform realtime.send('{"kind":"state"}'::jsonb,'changed','lcs:'||target::text,false);return ml_challenge.snapshot(target,null,true);
 end if;
 if p_action in ('student-snapshot','submit','student-next','retry') then
  token:=p_payload->>'token';
  select * into p from ml_challenge.players where session_id=target and token_hash=encode(sha256(convert_to(coalesce(token,''),'UTF8')),'hex') and not kicked;
  if not found then raise exception 'Rejoin with the game PIN on this browser' using errcode='42501';end if;
  if p_action='student-snapshot' then perform ml_challenge.tick(target);update ml_challenge.players set last_seen=clock_timestamp() where id=p.id;return ml_challenge.snapshot(target,p.id,false);end if;
  perform ml_challenge.tick(target);
  select * into s from ml_challenge.sessions where id=target for share;
  select * into p from ml_challenge.players where id=p.id for update;
  if s.expires_at<=clock_timestamp() then raise exception 'This game’s deadline has passed';end if;
  if p_action='retry' then
   if not s.challenge or not p.finished or p.attempt>=s.attempts then raise exception 'No further attempts are available';end if;
   update ml_challenge.players set score=0,streak=0,correct=0,progress=0,attempt=attempt+1,finished=false,question_started=clock_timestamp() where id=p.id;return ml_challenge.snapshot(target,p.id,false);
  end if;
  qi:=case when s.challenge then p.progress else s.current end;
  q:=s.snapshot->'questions'->qi;
  if p_action='student-next' then
   if not s.challenge or p.finished then raise exception 'Wait for your instructor';end if;
   if q->>'type'<>'info' and not exists(select 1 from ml_challenge.submissions where player_id=p.id and question_index=qi and attempt=p.attempt) then raise exception 'Submit an answer first';end if;
   update ml_challenge.players set progress=progress+1,finished=progress+1>=jsonb_array_length(s.snapshot->'questions'),question_started=clock_timestamp() where id=p.id;return ml_challenge.snapshot(target,p.id,false);
  end if;
  if (p_payload->>'index')::integer<>qi or p.finished then raise exception 'This question is no longer accepting answers';end if;
  select * into r from ml_challenge.submissions where player_id=p.id and question_index=qi and attempt=p.attempt;
  if r.id is not null then
   if r.request_id<>(p_payload->>'request')::uuid then raise exception 'An answer is already recorded for this question' using errcode='23505';end if;
   return ml_challenge.snapshot(target,p.id,false);
  end if;
  if not s.challenge and (s.stage<>'question' or (s.deadline is not null and s.deadline<=clock_timestamp())) then raise exception 'The answer window has closed';end if;
  if q->>'type'='info' or not ml_challenge.valid_answer(q,p_payload->'answer') then raise exception 'Invalid answer. Check the question instructions.';end if;
  amt:=ml_challenge.credit(q,p_payload->'answer');
  ms:=greatest(0,case when s.challenge then extract(epoch from(clock_timestamp()-p.question_started))*1000 else (s.elapsed+extract(epoch from(clock_timestamp()-s.started_at)))*1000 end);
  pts:=ml_challenge.points(q,s.settings,amt,ms,case when amt=1 then p.streak+1 else 0 end);
  insert into ml_challenge.submissions(session_id,player_id,question_index,attempt,request_id,answer,credit,points,elapsed_ms,pending) values(target,p.id,qi,p.attempt,(p_payload->>'request')::uuid,p_payload->'answer',amt,pts,ms,amt=-1);
  update ml_challenge.players set score=score+pts,streak=case when amt=1 then streak+1 when amt is null then streak else 0 end,correct=correct+greatest(0,coalesce(amt,0)),response_ms=response_ms+ms,last_seen=clock_timestamp() where id=p.id;
  perform realtime.send('{"kind":"answer"}'::jsonb,'changed','lcs:'||target::text,false);
  return ml_challenge.snapshot(target,p.id,false);
 end if;
 raise exception 'Unknown action';
end $$;
notify pgrst,'reload schema';
