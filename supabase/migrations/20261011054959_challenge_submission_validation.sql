do $$ declare definition text; begin select pg_get_functiondef('ml_challenge.gateway(text,uuid,text,jsonb)'::regprocedure) into definition; definition:=replace(definition,'pts,ms,amt=-1);','pts,ms,coalesce(amt=-1,false));'); execute definition; end $$;
notify pgrst,'reload schema';
