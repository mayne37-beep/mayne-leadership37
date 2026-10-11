do $$ declare definition text; begin
 select pg_get_functiondef('ml_challenge.gateway(text,uuid,text,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'length(code) not between 2 and 40','length(code) not between (case when coalesce((s.settings->>''anonymous'')::boolean,false) then 1 else coalesce((s.settings->>''nicknameMin'')::int,2) end) and (case when coalesce((s.settings->>''anonymous'')::boolean,false) then 40 else coalesce((s.settings->>''nicknameMax'')::int,40) end)');
 definition:=replace(definition,'raise exception ''Use a nickname with 2–40 characters'';end if;','raise exception ''Use a name within the instructor’s configured length (up to 40 characters)'';end if; if not coalesce((s.settings->>''anonymous'')::boolean,false) and coalesce((s.settings->>''fullName'')::boolean,false) and code!~''[[:space:]]'' then raise exception ''Enter a two-part name as requested by your instructor'';end if;');
 definition:=replace(definition,'''anonymous'',s.settings->''anonymous'');end if;','''anonymous'',s.settings->''anonymous'',''nicknamePrompt'',coalesce(s.settings->>''nicknamePrompt'',''First name or nickname''),''nicknameMin'',coalesce((s.settings->>''nicknameMin'')::int,2),''nicknameMax'',coalesce((s.settings->>''nicknameMax'')::int,40),''fullName'',coalesce((s.settings->>''fullName'')::boolean,false));end if;');
 execute definition;
end $$;
notify pgrst,'reload schema';
