create schema ml_signups;

create table ml_signups.boards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  details text not null,
  slots jsonb not null,
  closed boolean not null default false,
  created_at timestamptz not null default now()
);

create table ml_signups.reservations (
  board uuid not null references ml_signups.boards(id),
  slot integer not null,
  proof_hash bytea not null,
  name text not null,
  primary key (board, slot, proof_hash)
);

alter table ml_signups.boards enable row level security;
alter table ml_signups.reservations enable row level security;

create function public.ml_signups_rpc(p_key text, p_action text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  board ml_signups.boards%rowtype;
  slot_index integer;
  proof bytea;
  availability jsonb;
  reserved integer;
begin
  if p_key is null or length(p_key) <> 64 or not exists (
    select 1 from ml_authoring.gateway_keys where key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex')
  ) then raise insufficient_privilege; end if;

  if p_action = 'create' then
    insert into ml_signups.boards(title, details, slots)
      values (p_payload->>'title', p_payload->>'details', p_payload->'slots')
      returning * into board;
    return jsonb_build_object('id', board.id);
  elsif p_action = 'list' then
    return coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at desc) from ml_signups.boards b), '[]');
  end if;

  -- Serialize reservations, cancellations and closing for each board.
  select * into board from ml_signups.boards where id = (p_payload->>'id')::uuid for update;
  if not found then return jsonb_build_object('error', 'This sign-up could not be found.'); end if;

  if p_action = 'close' then
    update ml_signups.boards set closed = true where id = board.id;
    board.closed := true;
  elsif p_action in ('reserve', 'cancel') then
    slot_index := (p_payload->>'slot')::integer;
    proof := sha256(convert_to(p_payload->>'proof', 'UTF8'));
    if slot_index < 0 or slot_index >= jsonb_array_length(board.slots) then
      return jsonb_build_object('error', 'Select a slot.');
    end if;
    if p_action = 'cancel' then
      delete from ml_signups.reservations where reservations.board = board.id and slot = slot_index and proof_hash = proof;
    elsif not exists (select 1 from ml_signups.reservations where reservations.board = board.id and slot = slot_index and proof_hash = proof) then
      if board.closed then return jsonb_build_object('error', 'This sign-up is closed.'); end if;
      select count(*) into reserved from ml_signups.reservations where reservations.board = board.id and slot = slot_index;
      if reserved >= (board.slots->slot_index->>'capacity')::integer then
        return jsonb_build_object('error', 'That slot is full. Refresh to see other openings.');
      end if;
      insert into ml_signups.reservations values (board.id, slot_index, proof, p_payload->>'name');
    end if;
  end if;

  select jsonb_agg(s.value || jsonb_build_object('remaining', (s.value->>'capacity')::integer -
    (select count(*) from ml_signups.reservations r where r.board = board.id and r.slot = s.ordinality - 1))
    order by s.ordinality)
  into availability from jsonb_array_elements(board.slots) with ordinality s;

  return jsonb_build_object('id', board.id, 'title', board.title, 'details', board.details, 'closed', board.closed, 'slots', availability)
    || case when p_action in ('roster', 'close') then jsonb_build_object('roster',
      coalesce((select jsonb_agg(jsonb_build_object('slot', r.slot, 'name', r.name) order by r.slot, r.name)
        from ml_signups.reservations r where r.board = board.id), '[]')) else '{}'::jsonb end;
end;
$$;

revoke all on function public.ml_signups_rpc(text, text, jsonb) from public, authenticated;
grant execute on function public.ml_signups_rpc(text, text, jsonb) to anon;
