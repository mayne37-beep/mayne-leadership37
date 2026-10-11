do $$ declare definition text; begin
 select pg_get_functiondef('ml_challenge.gateway(text,uuid,text,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'realtime.send(''{"kind":"lobby"}''::jsonb,''changed'',''lcs:''||s.id::text,false)','realtime.send(''{"kind":"lobby"}''::jsonb,''changed'',''lcs-host:''||s.id::text,false)');
 definition:=replace(definition,'realtime.send(''{"kind":"answer"}''::jsonb,''changed'',''lcs:''||target::text,false)','realtime.send(''{"kind":"answer"}''::jsonb,''changed'',''lcs-host:''||target::text,false)');
 execute definition;
end $$;
notify pgrst,'reload schema';
