-- ============================================================
-- BASE INFERIDA (HIPOTESIS) - coins-mvp
-- ------------------------------------------------------------
-- Las 12 tablas que app.js usa y que NINGUNA MIGRATION_*.sql crea.
-- Reconstruidas por evidencia: cada columna lleva el archivo:linea de app.js
-- (o SUPABASE_SETUP.md) que la justifica. Lo marcado HIPOTESIS es una
-- conjetura razonable (clave de .insert/.update sin migracion que la agregue);
-- si un exploit sale rojo por falta de columna, la hipotesis estaba mal.
--
-- RLS: se deja DESACTIVADA en las 12 (Supabase no la activa en CREATE TABLE).
-- Es lo minimo que explica que la app funcione con la anon key haciendo
-- select('*') y update sobre profiles (app.js:1663-1676, 1315-1328).
-- NO se prueba pg_policies de produccion; eso va despues, con el si de Christiam.
--
-- Este archivo lo copia tools/armar_esquema.js a supabase/migrations/ como
-- la PRIMERA migracion, seguido de las 10 MIGRATION_*.sql en orden.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1) profiles  (migraciones posteriores le agregan pin_hash,
--    institution_id, teacher_credits, xp, level, longest_streak,
--    force_password_reset, account_locked, is_active, last_login_at)
-- ------------------------------------------------------------
create table if not exists public.profiles (
    id              uuid primary key default gen_random_uuid(),  -- app.js:249,907,1218
    documento_id    text unique,                                  -- app.js:83,1006,1282 (seed usa ON CONFLICT (documento_id))
    pin             text,                                         -- app.js:3796,3809 (.update {pin})
    nombre_completo text,                                         -- app.js:83,1282,1601
    rol             text,                                         -- app.js:1218,1282,3866
    grupo           text,                                         -- app.js:1218,1282,1704
    monedas         integer default 0,                            -- app.js:249,1319,3941
    coin_pocket     integer,                                      -- HIPOTESIS app.js:3150,3164 (.update {coin_pocket})
    coin_budget     integer,                                      -- HIPOTESIS app.js:4605,4649 (.update {coin_budget})
    current_streak  integer default 0,                            -- HIPOTESIS app.js:4156,4158 (.update {current_streak})
    created_at      timestamptz default now()
);

-- ------------------------------------------------------------
-- 2) groups  (attendance.student_id referencia profiles(documento_id)
--    y group_code referencia groups(group_code) - SUPABASE_SETUP.md:14)
-- ------------------------------------------------------------
create table if not exists public.groups (
    id             uuid primary key default gen_random_uuid(),   -- app.js:1060,1076,1137
    group_code     text unique,                                   -- app.js:742,753,1060
    max_capacity   integer,                                       -- app.js:1137,1154 (.update {max_capacity})
    capacity       integer,                                       -- HIPOTESIS app.js:1154,1159
    institution_id uuid,                                          -- app.js:742,3284
    last_admin_lat double precision,                              -- app.js:1258 (.update {last_admin_lat})
    last_admin_lng double precision,                              -- app.js:1258 (.update {last_admin_lng})
    created_at     timestamptz default now()
);

-- ------------------------------------------------------------
-- 3) english_challenges  (CONFIG.tables.challenges -> 'english_challenges')
--    correct_answer es la clave del exploit E3; challenge.correct_answer
--    se lee en app.js:434,446,481,502. Migraciones agregan cefr_level,
--    skill(_type), topic, xp_reward, coins_reward, max_attempts, etc.
-- ------------------------------------------------------------
create table if not exists public.english_challenges (
    id              uuid primary key default gen_random_uuid(),  -- app.js:1826,1832,1869
    title           text,                                         -- HIPOTESIS
    question_text   text,                                         -- HIPOTESIS
    options_json    jsonb,                                        -- HIPOTESIS
    correct_answer  text,                                         -- app.js:434,446,481,502 (challenge.correct_answer) -> exploit E3
    group_code      text,                                         -- HIPOTESIS
    is_active       boolean default true,                         -- app.js:1826,1832
    status          text default 'active',                        -- app.js:1826,1839
    current_winners integer default 0,                            -- app.js:1826,1832 (.update {current_winners})
    max_winners     integer,                                      -- app.js:1826,1832
    created_by      uuid,                                         -- app.js:4211
    created_at      timestamptz default now()                     -- app.js:2689,2695
);

-- ------------------------------------------------------------
-- 4) completed_challenges  (CONFIG.tables.challenge_submissions)
--    student_id guarda el documento (app.js:2882). Sin FK a proposito:
--    la app es permisiva y el exploit E4 fabrica una fila.
-- ------------------------------------------------------------
create table if not exists public.completed_challenges (
    id            uuid primary key default gen_random_uuid(),     -- app.js:2750,2756
    challenge_id  uuid,                                            -- app.js:2799,2806,2881
    student_id    text,                                            -- app.js:2750,2882 (guarda documento)
    answer        text,                                            -- app.js:2883,2898
    is_correct    boolean,                                         -- app.js:2799,2884
    coins_awarded integer,                                         -- app.js:2885,2900
    created_at    timestamptz default now(),
    unique (challenge_id, student_id)                              -- app.js:2894 (ruta de unique violation)
);

-- ------------------------------------------------------------
-- 5) challenge/attendance sessions
-- ------------------------------------------------------------
create table if not exists public.attendance (
    id              uuid primary key default gen_random_uuid(),   -- app.js:1548
    student_id      text,                                          -- app.js:70,135,1548 (documento; SUPABASE_SETUP.md:6)
    group_code      text,                                          -- app.js:70,135,1593
    attendance_date date,                                          -- app.js:70,135 (.eq attendance_date)
    documento_id    text,                                          -- HIPOTESIS app.js:1593,1623 (select)
    nombre_completo text,                                          -- HIPOTESIS app.js:1593,1623 (denormalizado en select)
    latitude        double precision,                              -- SUPABASE_SETUP.md:20
    longitude       double precision,                              -- SUPABASE_SETUP.md:21
    created_at      timestamptz default now(),                     -- app.js:70,1593
    unique (student_id, attendance_date)                           -- SUPABASE_SETUP.md:26
);

create table if not exists public.attendance_sessions (
    id           uuid primary key default gen_random_uuid(),
    session_code text,                                             -- app.js:1528
    group_code   text,                                             -- app.js:114
    status       text,                                             -- app.js:1528
    expires_at   timestamptz,                                      -- app.js:1528
    created_at   timestamptz default now()                         -- app.js:114,1528
);

-- ------------------------------------------------------------
-- 6) auctions + auction_bids
-- ------------------------------------------------------------
create table if not exists public.auctions (
    id                  uuid primary key default gen_random_uuid(),-- app.js:659,1234,1908
    group_code          text,                                      -- app.js:1234
    item_name           text,                                      -- HIPOTESIS
    status              text,                                      -- app.js:659,1234,1755
    current_bid         integer,                                   -- app.js:1936,1944 (.update {current_bid})
    highest_bidder_id   uuid,                                      -- app.js:1936 (.update {highest_bidder_id})
    highest_bidder_name text,                                      -- app.js:1960 (.update {highest_bidder_name})
    winner_id           uuid,                                      -- app.js:2088,2166 (.update {winner_id})
    duration_seconds    integer,                                   -- app.js:659
    start_at            timestamptz,                               -- app.js:659
    stock_quantity      integer,                                   -- app.js:2277 (.update {stock_quantity})
    created_at          timestamptz default now()                  -- app.js:1770,1786,2229
);

create table if not exists public.auction_bids (
    id          uuid primary key default gen_random_uuid(),        -- app.js:2216
    auction_id  uuid,                                              -- app.js:2216,2242
    item_source text,                                              -- app.js:2216
    source_id   text,                                              -- app.js:2216
    student_id  text,                                              -- HIPOTESIS
    amount      integer,                                           -- HIPOTESIS
    created_at  timestamptz default now()                          -- app.js:2242
);

-- ------------------------------------------------------------
-- 7) announcements
-- ------------------------------------------------------------
create table if not exists public.announcements (
    id         uuid primary key default gen_random_uuid(),         -- app.js:2664,2679
    title      text,                                               -- HIPOTESIS
    body       text,                                               -- HIPOTESIS
    group_code text,                                               -- HIPOTESIS
    status     text,                                               -- app.js:2679
    created_at timestamptz default now()                           -- app.js:2582,2605,2679
);

-- ------------------------------------------------------------
-- 8) student_inventory
-- ------------------------------------------------------------
create table if not exists public.student_inventory (
    id             uuid primary key default gen_random_uuid(),     -- app.js:2134,2141
    student_id     text,                                           -- app.js:2134,2341 (documento)
    item_name      text,                                           -- app.js:2449,2550
    item_source    text,                                           -- app.js:2222
    source_id      text,                                           -- app.js:2222
    status         text,                                           -- app.js:2341,2474
    stock_quantity integer,                                        -- HIPOTESIS app.js:2312
    purchased_at   timestamptz,                                    -- app.js:2351,2550
    expires_at     timestamptz,                                    -- app.js:2341,2449
    created_at     timestamptz default now()
);

-- ------------------------------------------------------------
-- 9) feedback_messages
-- ------------------------------------------------------------
create table if not exists public.feedback_messages (
    id         uuid primary key default gen_random_uuid(),         -- app.js:2414
    student_id text,                                               -- HIPOTESIS
    teacher_id uuid,                                               -- HIPOTESIS
    message    text,                                               -- HIPOTESIS
    status     text,                                               -- app.js:2396 (.update {status})
    created_at timestamptz default now()                           -- app.js:2396
);

-- ------------------------------------------------------------
-- 10) billing_claims
-- ------------------------------------------------------------
create table if not exists public.billing_claims (
    id         uuid primary key default gen_random_uuid(),         -- app.js:2489,2535
    student_id text,                                               -- app.js:2535,2542
    item_name  text,                                               -- app.js:2535,2542
    status     text,                                               -- app.js:2519,2542 (.update {status})
    created_at timestamptz default now()                           -- app.js:2519
);
