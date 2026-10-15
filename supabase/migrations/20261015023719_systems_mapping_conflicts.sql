-- Convert a retryable serialization conflict into an explicit application result.
-- Additive wrapper; the existing, key-checked gateway remains unchanged.
create function ml_systems.safe_gateway(p_key text,p_action text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=''
as $function$
begin
 return ml_systems.gateway(p_key,p_action,p_payload);
exception when serialization_failure then
 return jsonb_build_object('conflict',true);
end;
$function$;
revoke all on function ml_systems.safe_gateway(text,text,jsonb) from public;
grant execute on function ml_systems.safe_gateway(text,text,jsonb) to anon,authenticated;
create function public.ml_systems_safe_rpc(p_key text,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path=''
as $function$ select ml_systems.safe_gateway(p_key,p_action,p_payload); $function$;
revoke all on function public.ml_systems_safe_rpc(text,text,jsonb) from public;
grant execute on function public.ml_systems_safe_rpc(text,text,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
