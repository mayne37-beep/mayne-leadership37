import {writeFile} from 'node:fs/promises';
import {demoProject} from '../../assets/interactive-model.js';
const p=demoProject(),data=JSON.stringify(p).replace(/'/g,"''");
const sql="begin;\n"+
  "insert into ml_authoring.gateway_keys(key_hash) values(encode(sha256(convert_to(repeat('a',64),'UTF8')),'hex')) on conflict do nothing;\n"+
  "do $test$ declare k text:=repeat('a',64); p jsonb:='"+data+"'::jsonb; r jsonb; begin\n"+
  "begin perform public.ml_interactive_rpc('', 'list','{}');raise exception 'FAIL invalid key accepted';exception when insufficient_privilege then null;end;\n"+
  "r:=public.ml_interactive_rpc(k,'create',jsonb_build_object('id',p->>'id','data',p));if (r->>'version')::int<>1 then raise exception 'FAIL create';end if;\n"+
  "r:=public.ml_interactive_rpc(k,'get',jsonb_build_object('id',p->>'id'));if r->'data'<>p then raise exception 'FAIL source roundtrip';end if;\n"+
  "r:=public.ml_interactive_rpc(k,'save',jsonb_build_object('id',p->>'id','data',p,'version',1));if (r->>'version')::int<>2 then raise exception 'FAIL version increment';end if;\n"+
  "begin perform public.ml_interactive_rpc(k,'save',jsonb_build_object('id',p->>'id','data',p,'version',1));raise exception 'FAIL stale save accepted';exception when serialization_failure then null;end;\n"+
  "r:=public.ml_interactive_rpc(k,'history',jsonb_build_object('id',p->>'id'));if jsonb_array_length(r)<>1 or r->0->'data'<>p then raise exception 'FAIL revision';end if;\n"+
  "if has_table_privilege('anon','ml_interactive.projects','SELECT') or has_table_privilege('authenticated','ml_interactive.projects','SELECT') then raise exception 'FAIL source table exposed';end if;\n"+
  "end $test$;\nselect 'PASS source roundtrip, optimistic conflict, revision, invalid key, private table grants' as verification;\nrollback;";
await writeFile(process.argv[2]||'/tmp/interactive-sql-test.sql',sql);
