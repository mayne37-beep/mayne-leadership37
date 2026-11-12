-- Extend the existing classroom RPCs with weighted ballots and a host-controlled reveal.
-- Function signatures and privileges stay in place for existing Studio sessions.

CREATE OR REPLACE FUNCTION crs_private.validate_deck(p_deck jsonb, p_active text)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare s jsonb; it jsonb; ids text[]:='{}'; choices text[]; kind text; key text; n integer;
begin
  if jsonb_typeof(p_deck) is distinct from 'array' then raise exception 'Choose a valid presentation.'; end if;
  if jsonb_array_length(p_deck) not between 1 and 100 or octet_length(p_deck::text)>8000000 then raise exception 'Presentation is too large.'; end if;
  for s in select value from jsonb_array_elements(p_deck) loop
    if jsonb_typeof(s) is distinct from 'object' or coalesce(s->>'id','') !~ '^[A-Za-z0-9_-]{1,100}$' or s->>'id' in ('__proto__','constructor','prototype') or s->>'id'=any(ids) then raise exception 'Slide IDs must be unique.'; end if;
    ids:=array_append(ids,s->>'id');kind:=s->>'type';
    if kind is null or kind not in ('wordcloud','poll','open','scale','ranking','dotvote','pin','xy') then raise exception 'Unknown question type.'; end if;
    if jsonb_typeof(s->'question') is distinct from 'string' or length(s->>'question')>220 or jsonb_typeof(s->'info') is distinct from 'string' or length(s->>'info')>500 then raise exception 'Question or instructions are too long.'; end if;
    if jsonb_typeof(s->'accepting') is distinct from 'boolean' then raise exception 'Invalid response setting.'; end if;
    if kind='wordcloud' then
      if not crs_private.is_number(s,'responseLimit',1,10) or (s->>'responseLimit')::numeric<>trunc((s->>'responseLimit')::numeric) then raise exception 'Choose 1 to 10 responses per student.'; end if;
    elsif kind='open' then
      if not crs_private.is_number(s,'openLimit',100,2000) or (s->>'openLimit')::numeric<>trunc((s->>'openLimit')::numeric) then raise exception 'Invalid written response limit.'; end if;
    elsif kind in ('poll','ranking','scale','dotvote') then
      key:=case when kind='scale' then 'statements' else 'choices' end;
      if jsonb_typeof(s->key) is distinct from 'array' then raise exception 'Add choices or statements.'; end if;
      n:=jsonb_array_length(s->key);
      if n not between 1 and 10 then raise exception 'Use up to 10 choices or statements.'; end if;
      choices:='{}';
      for it in select value from jsonb_array_elements(s->key) loop
        if jsonb_typeof(it) is distinct from 'object' or coalesce(it->>'id','') !~ '^[A-Za-z0-9_-]{1,100}$' or it->>'id' in ('__proto__','constructor','prototype') or it->>'id'=any(choices) or jsonb_typeof(it->'label') is distinct from 'string' or length(it->>'label')>160 then raise exception 'Invalid choice or statement.'; end if;
        choices:=array_append(choices,it->>'id');
      end loop;
      if kind='poll' and jsonb_typeof(s->'multiple') is distinct from 'boolean' then raise exception 'Invalid poll setting.'; end if;
      if kind='dotvote' then
        if jsonb_typeof(s->'dotRevealed') is distinct from 'boolean' then
          raise exception 'Invalid dot voting reveal setting.';
        end if;
        if (s->>'dotRevealed')::boolean and (s->>'accepting')::boolean then
          raise exception 'Close voting before revealing the tally.';
        end if;
      end if;
      if kind='scale' then
        if not crs_private.is_number(s,'scaleMin',0,9) or not crs_private.is_number(s,'scaleMax',1,10) then raise exception 'Invalid scale range.'; end if;
        if (s->>'scaleMin')::numeric>=(s->>'scaleMax')::numeric or (s->>'scaleMin')::numeric<>trunc((s->>'scaleMin')::numeric) or (s->>'scaleMax')::numeric<>trunc((s->>'scaleMax')::numeric) then raise exception 'Use an increasing whole-number scale.'; end if;
        foreach key in array array['scaleLow','scaleHigh'] loop
          if jsonb_typeof(s->key) is distinct from 'string' or length(s->>key)>80 then raise exception 'Invalid scale label.'; end if;
        end loop;
      end if;
    elsif kind='pin' then
      if jsonb_typeof(s->'pinImage') is distinct from 'string' or length(s->>'pinImage')>2500000 or ((s->>'pinImage')<>'' and (s->>'pinImage') !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$') then raise exception 'Choose a PNG, JPEG, or WebP image.'; end if;
    elsif kind='xy' then
      foreach key in array array['xMin','xMax','yMin','yMax'] loop
        if not crs_private.is_number(s,key,-1000,1000) then raise exception 'Invalid axis range.'; end if;
      end loop;
      if (s->>'xMin')::numeric>=(s->>'xMax')::numeric or (s->>'yMin')::numeric>=(s->>'yMax')::numeric then raise exception 'Axis maximum must exceed its minimum.'; end if;
      foreach key in array array['xLabel','yLabel','xLow','xHigh','yLow','yHigh'] loop
        if jsonb_typeof(s->key) is distinct from 'string' or length(s->>key)>80 then raise exception 'Invalid axis label.'; end if;
      end loop;
    end if;
  end loop;
  if p_active is null or not p_active=any(ids) then raise exception 'Choose a slide in this presentation.'; end if;
end; $function$;

CREATE OR REPLACE FUNCTION crs_private.slide_ready(s jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare kind text:=s->>'type'; key text;
begin
  if coalesce(length(trim(s->>'question')),0)=0 then return false; end if;
  if kind in ('poll','ranking','scale','dotvote') then
    key:=case when kind='scale' then 'statements' else 'choices' end;
    if kind<>'scale' and jsonb_array_length(s->key)<2 then return false; end if;
    if exists(select 1 from jsonb_array_elements(s->key) where length(trim(value->>'label'))=0) then return false; end if;
  end if;
  if kind='pin' and coalesce(s->>'pinImage','')='' then return false; end if;
  return true;
end; $function$;

CREATE OR REPLACE FUNCTION crs_private.response_schema(s jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case s->>'type'
    when 'poll' then jsonb_build_object('type','poll','multiple',s->'multiple','ids',(select jsonb_agg(value->>'id' order by value->>'id') from jsonb_array_elements(s->'choices')))
    when 'dotvote' then jsonb_build_object('type','dotvote','question',s->'question','choices',s->'choices')
    when 'ranking' then jsonb_build_object('type','ranking','ids',(select jsonb_agg(value->>'id' order by value->>'id') from jsonb_array_elements(s->'choices')))
    when 'scale' then jsonb_build_object('type','scale','min',s->'scaleMin','max',s->'scaleMax','ids',(select jsonb_agg(value->>'id' order by value->>'id') from jsonb_array_elements(s->'statements')))
    when 'pin' then jsonb_build_object('type','pin','image',encode(extensions.digest(coalesce(s->>'pinImage',''),'sha256'),'hex'))
    when 'xy' then jsonb_build_object('type','xy','xmin',s->'xMin','xmax',s->'xMax','ymin',s->'yMin','ymax',s->'yMax')
    else jsonb_build_object('type',s->'type') end;
$function$;

CREATE OR REPLACE FUNCTION crs_private.validate_answer(s jsonb, a jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare kind text:=s->>'type'; it jsonb; id text; ids text[]:='{}'; selected text[]:='{}'; clean text; words jsonb:='[]'; ratings jsonb:='{}'; rating_value numeric; x numeric; y numeric; dot_id text; dot_count jsonb; dot_total integer:=0;
begin
  if jsonb_typeof(a) is distinct from 'object' or octet_length(a::text)>15000 then raise exception 'Invalid response.'; end if;
  if kind='wordcloud' then
    if jsonb_typeof(a->'words') is distinct from 'array' then raise exception 'Enter words or phrases.'; end if;
    if jsonb_array_length(a->'words') not between 1 and (s->>'responseLimit')::integer then raise exception 'Too many words for this question.'; end if;
    for it in select value from jsonb_array_elements(a->'words') loop
      if jsonb_typeof(it) is distinct from 'string' then raise exception 'Enter words or phrases.'; end if;
      clean:=regexp_replace(trim(it#>>'{}'),'\s+',' ','g');
      if length(clean) not between 1 and 65 then raise exception 'Use a word or short phrase of up to 65 characters.'; end if;
      words:=words||jsonb_build_array(clean);
    end loop;return jsonb_build_object('words',words);
  elsif kind='open' then
    if jsonb_typeof(a->'text') is distinct from 'string' or coalesce(length(trim(a->>'text')),0) not between 1 and (s->>'openLimit')::integer then raise exception 'Write a response within the character limit.'; end if;
    return jsonb_build_object('text',trim(a->>'text'));
  elsif kind in ('poll','ranking') then
    select array_agg(value->>'id') into ids from jsonb_array_elements(s->'choices');
    clean:=case when kind='poll' then 'choice_ids' else 'order' end;
    if jsonb_typeof(a->clean) is distinct from 'array' then raise exception 'Choose or rank the items.'; end if;
    for it in select value from jsonb_array_elements(a->clean) loop
      id:=it#>>'{}';if jsonb_typeof(it) is distinct from 'string' or not id=any(ids) or id=any(selected) then raise exception 'Each response must match an available choice.'; end if;
      selected:=array_append(selected,id);
    end loop;
    if cardinality(selected)<1 or (kind='poll' and not (s->>'multiple')::boolean and cardinality(selected)<>1) or (kind='ranking' and cardinality(selected)<>cardinality(ids)) then raise exception 'Choose one option or rank all items as instructed.'; end if;
    return jsonb_build_object(clean,to_jsonb(selected));
  elsif kind='dotvote' then
    if jsonb_typeof(a->'dots') is distinct from 'object' then
      raise exception 'Allocate both dots before submitting.';
    end if;
    select array_agg(value->>'id') into ids from jsonb_array_elements(s->'choices');
    for dot_id, dot_count in select key, value from jsonb_each(a->'dots') loop
      if not dot_id=any(ids) or dot_count not in ('1'::jsonb,'2'::jsonb) then
        raise exception 'Each dot must go to an available proposal.';
      end if;
      dot_total:=dot_total+(dot_count::numeric)::integer;
    end loop;
    if dot_total<>2 then raise exception 'Allocate both dots before submitting.'; end if;
    return jsonb_build_object('dots',a->'dots');
  elsif kind='scale' then
    if jsonb_typeof(a->'ratings') is distinct from 'object' or (select count(*) from jsonb_object_keys(a->'ratings'))<>jsonb_array_length(s->'statements') then raise exception 'Rate every statement.'; end if;
    for it in select value from jsonb_array_elements(s->'statements') loop
      id:=it->>'id';if not crs_private.is_number(a->'ratings',id,(s->>'scaleMin')::numeric,(s->>'scaleMax')::numeric) then raise exception 'Choose a rating on the scale for every statement.'; end if;
      rating_value:=(a->'ratings'->>id)::numeric;if rating_value<>trunc(rating_value) then raise exception 'Choose a whole-number rating.'; end if;
      ratings:=jsonb_set(ratings,array[id],to_jsonb(rating_value),true);
    end loop;return jsonb_build_object('ratings',ratings);
  elsif kind in ('pin','xy') then
    if not crs_private.is_number(a,'x',case when kind='pin' then 0 else (s->>'xMin')::numeric end,case when kind='pin' then 100 else (s->>'xMax')::numeric end) or not crs_private.is_number(a,'y',case when kind='pin' then 0 else (s->>'yMin')::numeric end,case when kind='pin' then 100 else (s->>'yMax')::numeric end) then raise exception 'Choose a position within both axes.'; end if;
    x:=round((a->>'x')::numeric,2);y:=round((a->>'y')::numeric,2);return jsonb_build_object('x',x,'y',y);
  end if;
  raise exception 'Unknown response type.';
end; $function$;

CREATE OR REPLACE FUNCTION crs_private.host_packet(v crs_private.sessions)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object('id',v.id,'code',v.code,'status',case when v.expires_at<=now() then 'expired' else v.status end,'expires_at',v.expires_at,'revision',v.revision,'active_slide_id',v.active_slide,'pacing',v.pacing,'epochs',v.epochs,'timers',v.timers,'server_now',clock_timestamp(),
    'responses',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'slide_id',r.slide_id,'epoch',r.epoch,'kind',r.kind,'answer',case when r.kind='dotvote' and s.value->'dotRevealed' is distinct from 'true'::jsonb then '{}'::jsonb else r.answer end,'at',r.created_at,'updated_at',r.updated_at) order by r.created_at,r.id)
      from crs_private.responses r
      join jsonb_array_elements(v.deck) s(value) on s.value->>'id'=r.slide_id
      where r.session_id=v.id and r.epoch=coalesce((v.epochs->>r.slide_id)::integer,1)),'[]'::jsonb));
$function$;

CREATE OR REPLACE FUNCTION crs_private.student_packet(v crs_private.sessions, p_participant uuid, p_token text, p_known_revision integer, p_slide_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  s jsonb;
  selected_slide text;
  answer jsonb;
  questions jsonb;
  dot_tally jsonb;
  ep integer;
  st text;
  verified boolean := false;
begin
  if v.pacing='self' then
    select value into s from jsonb_array_elements(v.deck)
      where value->>'id'=p_slide_id and crs_private.slide_ready(value);
    if s is null then
      select value into s from jsonb_array_elements(v.deck)
        where crs_private.slide_ready(value) limit 1;
    end if;
  end if;
  if s is null then
    select value into s from jsonb_array_elements(v.deck)
      where value->>'id'=v.active_slide;
  end if;
  selected_slide := s->>'id';
  ep := coalesce((v.epochs->>selected_slide)::integer,1);
  st := case when v.expires_at<=now() then 'expired'
    when v.status='ended' then 'ended'
    when v.status='paused' or not (s->>'accepting')::boolean
      or crs_private.timer_closed(v,selected_slide) then 'paused'
    else 'open' end;
  if p_participant is not null and p_token ~ '^[a-f0-9]{64}$' then
    select exists(select 1 from crs_private.participants p
      where p.session_id=v.id and p.id=p_participant
        and p.token_hash=crs_private.token_hash(p_token)) into verified;
  end if;
  if verified then
    select r.answer into answer from crs_private.responses r
      where r.session_id=v.id and r.slide_id=selected_slide
        and r.epoch=ep and r.participant_id=p_participant;
  end if;
  if v.pacing='self' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',q.value->>'id','question',q.value->>'question','type',q.value->>'type',
      'answered',r.id is not null) order by q.position),'[]'::jsonb)
    into questions
    from jsonb_array_elements(v.deck) with ordinality q(value,position)
    left join crs_private.responses r on verified and r.session_id=v.id
      and r.participant_id=p_participant and r.slide_id=q.value->>'id'
      and r.epoch=coalesce((v.epochs->>(q.value->>'id'))::integer,1)
    where crs_private.slide_ready(q.value);
  end if;
  if s->>'type'='dotvote' and s->'dotRevealed'='true'::jsonb then
    select jsonb_build_object('ballots',coalesce(sum(totals.dots),0)/2,
      'counts',coalesce(jsonb_object_agg(totals.choice_id,totals.dots),'{}'::jsonb))
    into dot_tally
    from (
      select allocation.key as choice_id,sum(allocation.value::integer) as dots
      from crs_private.responses r
      cross join lateral jsonb_each_text(r.answer->'dots') allocation
      where r.session_id=v.id and r.slide_id=selected_slide and r.epoch=ep and r.kind='dotvote'
      group by allocation.key
    ) totals;
  end if;
  return jsonb_build_object(
    'id',v.id,'code',v.code,'status',st,'expires_at',v.expires_at,
    'revision',v.revision,'pacing',v.pacing,'active_slide_id',selected_slide,
    'presenter_slide_id',v.active_slide,'slides',questions,'epoch',ep,
    'ready',crs_private.slide_ready(s),
    'slide',case when p_known_revision is distinct from v.revision then s else null end,
    'my_answer',answer,'dot_tally',dot_tally,'timer',v.timers->selected_slide,'server_now',clock_timestamp());
end; $function$;
