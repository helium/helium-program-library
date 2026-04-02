CREATE TABLE key_to_assets (
    address TEXT PRIMARY KEY,
    entity_key BYTEA,
    asset TEXT,
    key_serialization JSONB
);

CREATE TABLE asset_owners (
    asset TEXT PRIMARY KEY,
    owner TEXT,
    last_block BIGINT
);

CREATE TABLE welcome_packs (
    address TEXT PRIMARY KEY,
    owner TEXT,
    last_block BIGINT
);

CREATE TABLE iot_hotspot_infos (
    address TEXT PRIMARY KEY,
    asset TEXT,
    last_block BIGINT,
    location TEXT,
    elevation INTEGER,
    gain INTEGER,
    is_full_hotspot BOOLEAN
);

CREATE TABLE mobile_hotspot_infos (
    address TEXT PRIMARY KEY,
    asset TEXT,
    last_block BIGINT,
    location TEXT,
    device_type TEXT,
    is_full_hotspot BOOLEAN,
    deployment_info JSONB
);

CREATE TABLE recipients (
    address TEXT PRIMARY KEY,
    lazy_distributor TEXT,
    asset TEXT,
    destination TEXT,
    total_rewards BIGINT DEFAULT 0,
    last_block BIGINT
);

CREATE TABLE mini_fanouts (
    address TEXT PRIMARY KEY,
    owner TEXT,
    schedule TEXT,
    shares JSONB[],
    last_block BIGINT
);
