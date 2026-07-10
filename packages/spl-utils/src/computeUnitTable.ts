import {
  ComputeBudgetProgram,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";

// Fallback compute-unit table, used when transaction simulation fails.
//
// Key: `${programId}:${first 8 bytes of ix data as hex}` (anchor discriminator).
// Value: p95 consumed CU for that instruction (raw, no margin), measured on
// the WORST-CASE path: no accounts pre-initialized, so every init/
// init_if_needed pays account creation. Steady-state calls that hit existing
// accounts consume less than the table says — that's intentional. This is a
// fallback for when simulation fails; simulation is what gives the tight,
// state-aware number.
//
// MAINTENANCE RULE: every new instruction that ships to mainnet must get an
// entry here — and existing entries must be re-measured when an instruction's
// account structures change size. Run `pnpm run sample-cu` in this package
// (scripts/sample-cu.ts, built on src/cuSampler.ts). A missing entry makes
// transactions containing it fall back to MAX_COMPUTE_UNITS and overpay
// resource fees under SIMD-0553. CI enforces this pre-deploy: the
// test-contracts job runs `pnpm run check-cu-table` (scripts/check-cu-table.ts)
// against the localnet the anchor tests just exercised, failing on missing
// entries or drift beyond FALLBACK_CU_MARGIN.
export const INSTRUCTION_CU_TABLE: Record<string, number> = {
  // dc_auto_top.schedule_task_v0 (n=5, med=225550, max=230071) [localnet]
  "topqqzQZroCyRrgyM5zVq6xkFDVnfF13iixSjajydgU:eaccb3f1f9b4986e": 230071,
  // dc_auto_top.update_auto_top_off_v0 (n=2, med=52423, max=52423) [localnet]
  "topqqzQZroCyRrgyM5zVq6xkFDVnfF13iixSjajydgU:d973e6aa442fafc7": 52423,
  // dc_auto_top.initialize_auto_top_off_v0 (n=4, med=149418, max=152410) [localnet]
  "topqqzQZroCyRrgyM5zVq6xkFDVnfF13iixSjajydgU:1b878c374c515333": 152410,
  // tuktuk_dca.close_dca_v0 (n=1, med=69738, max=69738) [localnet]
  "tdcam4m5U74pEZQrsQ7fVAav4AUXXc6z8fkhvExfRVN:34871f9c70464b03": 69738,
  // tuktuk_dca.lend_v0 (n=4, med=17431, max=17431) [localnet]
  "tdcam4m5U74pEZQrsQ7fVAav4AUXXc6z8fkhvExfRVN:e10f950c9015525e": 17431,
  // tuktuk_dca.check_repay_v0 (n=4, med=44115, max=44115) [localnet]
  "tdcam4m5U74pEZQrsQ7fVAav4AUXXc6z8fkhvExfRVN:98c73c1c865777ea": 44115,
  // circuit_breaker.update_mint_windowed_breaker_v0 (n=1, med=2118, max=2118) [localnet]
  "circAbx64bbsscPbQzZAUvuXpHqrCe6fLMzc2uKXz9g:fa7a4d3065fef3a8": 2118,
  // circuit_breaker.remove_mint_authority_v0 (n=1, med=8245, max=8245) [localnet]
  "circAbx64bbsscPbQzZAUvuXpHqrCe6fLMzc2uKXz9g:c2d1a80365b0691e": 8245,
  // circuit_breaker.initialize_account_windowed_breaker_v0 (n=3, med=23002, max=26000) [localnet]
  "circAbx64bbsscPbQzZAUvuXpHqrCe6fLMzc2uKXz9g:1e406323709f29b1": 26000,
  // treasury_management.initialize_treasury_management_v0 (n=1, med=97294, max=97294) [localnet]
  "treaf4wWBBty3fHdyBpo35Mz84M8k3heKXmjmi9vFt5:9503c96c823838d2": 97294,
  // circuit_breaker.initialize_mint_windowed_breaker_v0 (n=1, med=14620, max=14620) [localnet]
  "circAbx64bbsscPbQzZAUvuXpHqrCe6fLMzc2uKXz9g:556cf6d2f8039fa7": 14620,
  // circuit_breaker.burn_v0 (n=3221, med=9509, max=14188);
  // fat tail (p95 9509) — some calls cost more, so use max
  "circAbx64bbsscPbQzZAUvuXpHqrCe6fLMzc2uKXz9g:adf6f0eae5b2f939": 14188,
  // circuit_breaker.mint_v0 (n=434, med=13940, max=13994)
  "circAbx64bbsscPbQzZAUvuXpHqrCe6fLMzc2uKXz9g:d2a4a1d34780dff4": 13994,
  // circuit_breaker.transfer_v0 (n=548, med=9889, max=10507)
  "circAbx64bbsscPbQzZAUvuXpHqrCe6fLMzc2uKXz9g:a2b6c16166557fbd": 10507,
  // data_credits.burn_delegated_data_credits_v0 — localnet p95 52793 (incl. account init);
  // mainnet (n=165, med=36574, max=38094) never hit the init path, so keep the higher value
  "credMBJhYFzfn7NxBMdU4aUqFggAjgztaCcv2Fo6fPT:9223fefc22ccdd85": 52793,
  // data_credits.burn_without_tracking_v0 (n=367, med=14602, max=70681);
  // fat tail (p95 20602) — some mainnet calls now hit the account-init path, so use max
  "credMBJhYFzfn7NxBMdU4aUqFggAjgztaCcv2Fo6fPT:816a2b04348f66d0": 70681,
  // data_credits.change_delegated_sub_dao_v0 (n=1, med=58802, max=58802) [localnet]
  "credMBJhYFzfn7NxBMdU4aUqFggAjgztaCcv2Fo6fPT:33b6f3246bf2b0b2": 58802,
  // data_credits.delegate_data_credits_v0 — localnet p95 63244 (incl. account init);
  // mainnet (n=54, med=26071, max=26071) never hit the init path, so keep the higher value
  "credMBJhYFzfn7NxBMdU4aUqFggAjgztaCcv2Fo6fPT:9a38e280a273e205": 63244,
  // data_credits.initialize_data_credits_v0 (n=4, med=43866, max=63366) [localnet]
  "credMBJhYFzfn7NxBMdU4aUqFggAjgztaCcv2Fo6fPT:17c173cadc9d4498": 63366,
  // data_credits.issue_data_credits_v0 (n=5, med=55963, max=69839);
  // p95 × 1.2 undershoots observed max, so use max
  "credMBJhYFzfn7NxBMdU4aUqFggAjgztaCcv2Fo6fPT:08ad2a3d9d5835b6": 69839,
  // data_credits.mint_data_credits_v0 — localnet p95 92991 (incl. account init);
  // mainnet (n=56, med=36033, max=59101) never hit the init path, so keep the higher value
  "credMBJhYFzfn7NxBMdU4aUqFggAjgztaCcv2Fo6fPT:4e6da984905edd39": 92991,
  // data_credits.update_data_credits_v0 (n=1, med=4470, max=4470) [localnet]
  "credMBJhYFzfn7NxBMdU4aUqFggAjgztaCcv2Fo6fPT:ad3d5fa348074519": 4470,
  // dc_auto_top.top_off_dc_v0 (n=405, med=207465, max=219706)
  "topqqzQZroCyRrgyM5zVq6xkFDVnfF13iixSjajydgU:b23a1aa0d17d480e": 219706,
  // dc_auto_top.top_off_hnt_v0 — localnet p95 222223; account structures grew,
  // so the prior mainnet reading (n=114, med=105577, max=110200) is stale and
  // under-requests. Re-measure via `pnpm run sample-cu` once it has mainnet volume.
  "topqqzQZroCyRrgyM5zVq6xkFDVnfF13iixSjajydgU:cc744535507a208c": 222223,
  // fanout.distribute_v0 (mainnet n=433, med=33555, max=43145; localnet p95=72441
  //   past bump-grind slack from runtime PDA grinding, raised to the localnet
  //   worst case so the sim-failure fallback never under-requests)
  "fanqeMu3fw8R4LwKNbahPtYXJsyLL6NXyfe2BqzhfB6:6de6e02f28465a94": 72441,
  // helium_entity_manager.approve_maker_v0 — localnet p95 35576 (CI run 28893311292);
  // earlier localnet sample (n=20, med=22076, max=27089) undershot the init path
  "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8:0ce6855c96e58d8e": 35576,
  // helium_entity_manager.approve_program_v0 (n=5, med=8963, max=10463) [localnet]
  "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8:05ee98b948780391": 10463,
  // helium_entity_manager.initialize_data_only_v0 (n=4, med=219009, max=277706) [localnet]
  "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8:1351db1e0a220c50": 277706,
  // helium_entity_manager.initialize_maker_v0 (n=74, med=165444, max=195444) [localnet]
  "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8:cc1a3e8670c9a2a0": 183444,
  // helium_entity_manager.initialize_rewardable_entity_config_v0 (n=17, med=18827, max=25836) [localnet]
  "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8:ae32200f8f070b98": 25836,
  // helium_entity_manager.issue_data_only_entity_v0 (n=1, med=173032, max=173032)
  "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8:bf60f52e3f49cf11": 173032,
  // helium_entity_manager.issue_entity_v0 (n=10, med=226033, max=811271)
  "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8:e8c27a44a7f677c5": 811271,
  // helium_entity_manager.issue_iot_operations_fund_v0 (n=1, med=161073, max=161073) [localnet]
  "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8:de8378a3e6bb5bd1": 161073,
  // helium_entity_manager.issue_not_emitted_entity_v0 (n=1, med=202384, max=202384) [localnet]
  "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8:3c70f0ce50655ed2": 202384,
  // helium_entity_manager.issue_program_entity_v0 (n=11, med=201548, max=213537)
  "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8:466172e2219650d9": 213537,
  // helium_entity_manager.onboard_data_only_iot_hotspot_v0 (n=2, med=89343, max=89343)
  "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8:62b37f333abfaebc": 89343,
  // helium_entity_manager.onboard_data_only_mobile_hotspot_v0 (n=43, med=96693, max=130123);
  // p95 × 1.2 undershoots observed max, so use max
  "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8:1ebde5db7b773e98": 130123,
  // helium_entity_manager.onboard_iot_hotspot_v0 (n=4, med=109809, max=136021)
  "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8:2d1881260e41070f": 136021,
  // helium_entity_manager.onboard_mobile_hotspot_v0 (n=2, med=111987, max=111987)
  "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8:1790d29b08cb5acf": 111987,
  // helium_entity_manager.revoke_maker_v0 (n=1, med=5687, max=5687) [localnet]
  "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8:7917126e2b6f20fe": 5687,
  // helium_entity_manager.revoke_program_v0 (n=1, med=5050, max=5050) [localnet]
  "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8:a6782c8f053f79d2": 5050,
  // helium_entity_manager.set_entity_active_v0 (n=5, med=15340, max=19444) [localnet]
  "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8:eabacc1c5b58f6f4": 19444,
  // helium_entity_manager.set_maker_tree_v0 (n=20, med=44617, max=59617) [localnet]
  "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8:e20adef366cd0ddd": 59617,
  // helium_entity_manager.temp_pay_mobile_onboarding_fee_v0 (n=1, med=55267, max=55267) [localnet]
  "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8:7554404c891fbc1c": 55267,
  // helium_entity_manager.update_data_only_tree_v0 (n=1, med=47954, max=47954) [localnet]
  "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8:d6341e41d7267a66": 47954,
  // helium_entity_manager.update_iot_info_v0 (n=89, med=76104, max=128554);
  // p95 × 1.2 undershoots observed max, so use max
  "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8:d3ebcd1d6d569927": 128554,
  // helium_entity_manager.update_mobile_info_v0 (n=18, med=76554, max=101035);
  // p95 × 1.2 undershoots observed max, so use max — value is the prior
  // run's observed max (129637), kept because it's higher than this run's
  "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8:cf68529dc1e54999": 129637,
  // helium_entity_manager.update_rewardable_entity_config_v0 (n=2, med=10461, max=10461) [localnet]
  "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8:3455a9868a744e12": 10461,
  // helium_sub_daos.add_recent_proposal_to_dao_v0 (n=10, med=6185, max=6185) [localnet]
  "hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR:40e9782eac5354a3": 6185,
  // helium_sub_daos.calculate_utility_score_v0 — localnet p95 61135 (incl. account init);
  // mainnet (n=6, med=47615, max=50513) never hit the init path, so keep the higher value
  "hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR:6ba7facfb714abcb": 61135,
  // helium_sub_daos.change_delegation_v0 — localnet p95 105152 (incl. account init);
  // mainnet (n=2, med=82579, max=82579) never hit the init path, so keep the higher value
  "hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR:81ec694ab0bef674": 105152,
  // helium_sub_daos.claim_rewards_v0 (n=72, med=43206, max=50706)
  "hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR:6c062a0600debead": 49206,
  // helium_sub_daos.claim_rewards_v1 (n=1318, med=43233, max=54075);
  // p95 × 1.2 undershoots observed max, so use max — value is the prior
  // run's observed max (69267), kept because it's higher than this run's
  "hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR:60b6c45174ce9a69": 69267,
  // helium_sub_daos.close_delegation_v0 (n=7, med=47485, max=47973)
  "hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR:c3679952983b792e": 47973,
  // helium_sub_daos.delegate_v0 — localnet p95 75166 (incl. account init);
  // mainnet (n=3, med=53056, max=53531) never hit the init path, so keep the higher value
  "hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR:c18bff7e5f8690ef": 75166,
  // helium_sub_daos.extend_expiration_ts_v0 — localnet p95 87968 (incl. account init);
  // mainnet (n=10, med=61578, max=63290) never hit the init path, so keep the higher value
  "hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR:2992374f89120d04": 87968,
  // helium_sub_daos.initialize_dao_v0 (n=5, med=107771, max=124280) [localnet]
  "hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR:976801653a9f691f": 124280,
  // helium_sub_daos.initialize_sub_dao_v0 (n=19, med=118997, max=154997) [localnet]
  "hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR:b73528fd810d4368": 154997,
  // helium_sub_daos.issue_rewards_v0 (n=6, med=75371, max=75490)
  "hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR:a6ce1d9d4990a429": 75490,
  // helium_sub_daos.reset_lockup_v0 (n=3, med=23235, max=28790)
  "hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR:a3c456f96074ecc2": 28790,
  // helium_sub_daos.track_dc_burn_v0 — localnet p95 28281 (incl. account init);
  // mainnet (n=165, med=17766, max=19273) never hit the init path, so keep the higher value
  "hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR:d8b6f68e72073a9e": 28281,
  // helium_sub_daos.track_dc_onboarding_fees_v0 (n=5, med=6785, max=9785) [localnet]
  "hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR:d08f434b1fc1878e": 9785,
  // helium_sub_daos.transfer_v0 (n=5, med=59822, max=76320) [localnet]
  "hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR:a2b6c16166557fbd": 76320,
  // helium_sub_daos.update_dao_v0 (n=1, med=6127, max=6127) [localnet]
  "hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR:9dd177797d2dafa1": 6127,
  // helium_sub_daos.update_sub_dao_v0 (n=1, med=7218, max=7218) [localnet]
  "hdaoVTCqhfHHo75XdAMxBKdUqvq1i5bF23sisBqVgGR:d8a415fc617392df": 7218,
  // hexboosting.boost_v0 (n=4, med=61014, max=64014) [localnet]
  "hexbnKYoA2GercNNhHUCCfrTRWrHjT6ujKPXTa5NPqJ:92f69f33b423b544": 64014,
  // hexboosting.close_boost_v0 (n=2815, med=2605, max=2787)
  "hexbnKYoA2GercNNhHUCCfrTRWrHjT6ujKPXTa5NPqJ:7980030869de1f60": 2781,
  // hexboosting.initialize_boost_config_v0 (n=5, med=13886, max=15386) [localnet]
  "hexbnKYoA2GercNNhHUCCfrTRWrHjT6ujKPXTa5NPqJ:5b2129d12b1bb15c": 15386,
  // hexboosting.start_boost_v1 (n=1, med=2947, max=2947) [localnet]
  "hexbnKYoA2GercNNhHUCCfrTRWrHjT6ujKPXTa5NPqJ:d869e391350b90c7": 2947,
  // hexboosting.update_boost_config_v0 (n=1, med=3993, max=3993) [localnet]
  "hexbnKYoA2GercNNhHUCCfrTRWrHjT6ujKPXTa5NPqJ:56f63a60270e715a": 3993,
  // lazy_distributor.distribute_compression_rewards_v0 (n=337, med=74780, max=114725);
  // p95 × 1.2 undershoots observed max, so use max — value is the prior
  // run's observed max (120730), kept because it's higher than this run's
  "1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w:a030b8390569e947": 120730,
  // lazy_distributor.distribute_custom_destination_v0 — localnet max 80567 (incl. ATA init);
  // mainnet (n=3, med=25618, max=32954) never hit the init path, so keep the higher value
  "1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w:52268acb365ff0b6": 80567,
  // lazy_distributor.distribute_rewards_v0 — localnet max 59163 (incl. ATA init);
  // mainnet (n=2, med=29457) too thin and never hit the init path, so keep the higher value
  "1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w:eb132a0c7162d675": 59163,
  // lazy_distributor.initialize_compression_recipient_v0 (n=21, med=63152, max=81018);
  // p95 × 1.2 undershoots observed max, so use max — value is the prior
  // run's observed max (95720), kept because it's higher than this run's
  "1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w:509097151a90daae": 95720,
  // lazy_distributor.initialize_lazy_distributor_v0 (n=12, med=79481, max=103481) [localnet]
  "1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w:5237cacb9ec6f067": 103481,
  // lazy_distributor.initialize_recipient_v0 — localnet p95 25786 (incl. account init);
  // mainnet (n=5, med=16786, max=21286) [localnet] never hit the init path, so keep the higher value
  "1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w:d82333ab98293e6a": 25786,
  // lazy_distributor.set_current_rewards_v0 (n=320, med=7565, max=7626)
  "1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w:fbedbe80e4c35def": 7565,
  // lazy_distributor.set_current_rewards_v1 (n=20, med=12343, max=12343)
  "1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w:3e325d2999ca0dd1": 12343,
  // lazy_distributor.update_compression_destination_v0 (n=118, med=36484, max=57849)
  "1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w:75c8372c3ec3c951": 52961,
  // lazy_distributor.update_destination_v0 (n=1, med=3494, max=3494) [localnet]
  "1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w:c4edd0b26807240e": 3494,
  // lazy_distributor.update_lazy_distributor_v0 (n=1, med=6303, max=6303) [localnet]
  "1azyuavdMyvsivtNxPoz6SucD18eDHeXzFCUPq5XU7w:4976a7ecd3d59ed6": 6303,
  // lazy_transactions.initialize_lazy_transactions_v0 (n=1, med=11374, max=11374) [localnet]
  "1atrmQs3eq1N2FEYWu6tyTXbCjP4uQwExpjtnhXtS8h:20e3cf7f70321f9d": 11374,
  // lazy_transactions.execute_transaction_v0 (n=137, med=114219, max=172656)
  "1atrmQs3eq1N2FEYWu6tyTXbCjP4uQwExpjtnhXtS8h:d95dae6182b77e2c": 156774,
  // mini_fanout.close_mini_fanout_v0 (n=4, med=47983, max=79084)
  "mfanLprNnaiP4RX9Zz1BMcDosYHCqnG24H1fMEbi9Gn:6d929483c50acb64": 79084,
  // mini_fanout.distribute_v0 (mainnet n=134, med=129752, max=151290; localnet
  //   p95=247164 past bump-grind slack from runtime PDA grinding, raised to the
  //   localnet worst case so the sim-failure fallback never under-requests)
  "mfanLprNnaiP4RX9Zz1BMcDosYHCqnG24H1fMEbi9Gn:6de6e02f28465a94": 247164,
  // mini_fanout.initialize_mini_fanout_v0 (n=29, med=58576, max=68877)
  "mfanLprNnaiP4RX9Zz1BMcDosYHCqnG24H1fMEbi9Gn:0cd0601ffbf3b6f7": 65877,
  // mini_fanout.schedule_task_v0 (n=29, med=160736, max=175973)
  "mfanLprNnaiP4RX9Zz1BMcDosYHCqnG24H1fMEbi9Gn:eaccb3f1f9b4986e": 171480,
  // mini_fanout.update_mini_fanout_v0 (n=1, med=193465, max=193465) [localnet]
  "mfanLprNnaiP4RX9Zz1BMcDosYHCqnG24H1fMEbi9Gn:75d8d18303804134": 193465,
  // mini_fanout.update_wallet_delegate_v0 (n=1, med=187662, max=187662) [localnet]
  "mfanLprNnaiP4RX9Zz1BMcDosYHCqnG24H1fMEbi9Gn:744028b39e3d0c80": 187662,
  // mobile_entity_manager.approve_carrier_v0 (n=5, med=3701, max=3701) [localnet]
  "memMa1HG4odAFmUbGWfPwS1WWfK95k99F2YTkGvyxZr:85bc12fb6ed37c3e": 3701,
  // mobile_entity_manager.initialize_carrier_v0 (n=4, med=226636, max=253636) [localnet]
  "memMa1HG4odAFmUbGWfPwS1WWfK95k99F2YTkGvyxZr:b3b30a3cc4388749": 253636,
  // mobile_entity_manager.initialize_subscriber_v0 (n=10, med=288617, max=296524)
  "memMa1HG4odAFmUbGWfPwS1WWfK95k99F2YTkGvyxZr:8495a0e84fa7c2f8": 296524,
  // mobile_entity_manager.issue_carrier_nft_v0 (n=1, med=158165, max=158165) [localnet]
  "memMa1HG4odAFmUbGWfPwS1WWfK95k99F2YTkGvyxZr:2b544a080178b7de": 158165,
  // mobile_entity_manager.issue_service_rewards_nft_v0 (n=1, med=282332, max=282332)
  "memMa1HG4odAFmUbGWfPwS1WWfK95k99F2YTkGvyxZr:58ac46d225df19b7": 282332,
  // mobile_entity_manager.revoke_carrier_v0 (n=1, med=3715, max=3715) [localnet]
  "memMa1HG4odAFmUbGWfPwS1WWfK95k99F2YTkGvyxZr:92466d7699f94f2a": 3715,
  // mobile_entity_manager.update_carrier_tree_v0 (n=5, med=44992, max=56992) [localnet]
  "memMa1HG4odAFmUbGWfPwS1WWfK95k99F2YTkGvyxZr:5e9ada6c20c71de3": 56992,
  // price_oracle.submit_price_v0 (n=150, med=6213, max=6213)
  "porcSnvH9pvcYPmQ65Y8qcZSRxQBiBBQX7UV5nmBegy:602b842aaf26568d": 6213,
  // rewards_oracle.set_current_rewards_wrapper_v1 (n=320, med=23443, max=23504)
  "rorcfdX4h9m9swCKgcypaHJ8NGYVANBpmV9EHn3cYrF:a25beb44242d9b36": 23443,
  // rewards_oracle.set_current_rewards_wrapper_v2 (n=20, med=28702, max=28702)
  "rorcfdX4h9m9swCKgcypaHJ8NGYVANBpmV9EHn3cYrF:fb93f1b425970d7f": 28702,
  // treasury_management.redeem_v0 (n=150, med=122647, max=128131)
  "treaf4wWBBty3fHdyBpo35Mz84M8k3heKXmjmi9vFt5:eb7fab8b774deb76": 123073,
  // voter_stake_registry.clear_recent_proposals_v0 (n=8, med=9599, max=9599)
  "hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8:95c9c0c8b88e92e7": 9599,
  // voter_stake_registry.close_position_v0 — localnet p95 27962 (incl. account init);
  // mainnet (n=1, med=14872, max=14872) never hit the init path, so keep the higher value
  "hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8:adbc23d7b6ed9e07": 27962,
  // voter_stake_registry.configure_voting_mint_v0 (n=74, med=9398, max=9398) [localnet]
  "hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8:2e34e1900dd6f664": 9398,
  // voter_stake_registry.count_proxy_vote_v0 — localnet p95 52036 (CI run 28893311292);
  // earlier localnet sample (n=5, med=40036, max=43036) barely undershot the margin
  "hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8:52ac9d0849d6a83e": 52036,
  // voter_stake_registry.deposit_v0 — localnet p95 21616 (incl. account init);
  // mainnet (n=1, med=10735, max=10735) never hit the init path, so keep the higher value
  "hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8:aeea50891a95f41d": 21616,
  // voter_stake_registry.initialize_position_v0 — localnet p95 219735 (incl. account init);
  // mainnet (n=1, med=164311, max=164311) never hit the init path, so keep the higher value
  "hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8:fbad85c69e239861": 219735,
  // voter_stake_registry.initialize_registrar_v0 (n=17, med=177412, max=202912) [localnet]
  "hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8:785a390824ff5219": 202912,
  // voter_stake_registry.proxied_relinquish_vote_v0 (n=1, med=31658, max=31658) [localnet]
  "hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8:e9301a243eaa4f9e": 31658,
  // voter_stake_registry.proxied_relinquish_vote_v1 (n=2, med=6974, max=6974) [localnet]
  "hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8:44cd301ea43e0046": 6974,
  // voter_stake_registry.proxied_vote_v0 (n=2, med=37226, max=37226) [localnet]
  "hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8:8a913c33b9a7a29e": 37226,
  // voter_stake_registry.proxied_vote_v1 (n=3, med=11519, max=11519) [localnet]
  "hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8:beb055c81df8007f": 11519,
  // voter_stake_registry.relinquish_vote_v1 (n=1, med=33121, max=33121) [localnet]
  "hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8:8ec941e27088f866": 33121,
  // voter_stake_registry.reset_lockup_v0 (n=3, med=7545, max=8921)
  "hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8:a3c456f96074ecc2": 8921,
  // voter_stake_registry.set_time_offset_v0 (n=29, med=2995, max=2995) [localnet]
  "hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8:ade7d9e2b2f79057": 2995,
  // voter_stake_registry.transfer_v0 (n=5, med=25457, max=34455) [localnet]
  "hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8:a2b6c16166557fbd": 34455,
  // voter_stake_registry.vote_v0 (n=10, med=63786, max=67869) [localnet]
  "hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8:522f14166c3bf573": 67869,
  // voter_stake_registry.withdraw_v0 — localnet p95 32598 (incl. account init);
  // mainnet (n=1, med=20875, max=20875) never hit the init path, so keep the higher value
  "hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8:f07fcfe44519fd61": 32598,
  // welcome_pack.claim_welcome_pack_v0 (n=29, med=421605, max=452760)
  "we1cGnTxTkDP9Sk49dw1d3T7ik7V2NfnY4qDGCDHXfC:c1bdbddb61b052e7": 450737,
  // welcome_pack.close_welcome_pack_v0 (n=28, med=123949, max=164538)
  "we1cGnTxTkDP9Sk49dw1d3T7ik7V2NfnY4qDGCDHXfC:dcdeb87d64f3f3ac": 160147,
  // welcome_pack.initialize_welcome_pack_v0 (n=64, med=181642, max=223708)
  "we1cGnTxTkDP9Sk49dw1d3T7ik7V2NfnY4qDGCDHXfC:1e0bda1830c6205a": 216491,
  // tuktuk_dca.initialize_dca_v0 (n=1, med=115475, max=115475) [localnet]
  "tdcam4m5U74pEZQrsQ7fVAav4AUXXc6z8fkhvExfRVN:8b8f316cfb0cd23b": 115475,
  // helium_entity_manager.update_maker_v0 (n=1, med=2485, max=2485) [localnet]
  "hemjuPXBpNvggtaUnN1MwT3wrdhttKEfosTcc2P9Pg8:5ee3f08543e0196d": 2485,
  // price_oracle.initialize_price_oracle_v0 (n=5, med=7150, max=7150) [localnet]
  "porcSnvH9pvcYPmQ65Y8qcZSRxQBiBBQX7UV5nmBegy:7f38af8e33d815f2": 7150,
  // price_oracle.update_price_oracle_v0 (n=1, med=50973, max=50973) [localnet]
  "porcSnvH9pvcYPmQ65Y8qcZSRxQBiBBQX7UV5nmBegy:786faf77c4d879c0": 50973,
  // voter_stake_registry.transfer_position_v0 (n=1, med=67083, max=67083) [localnet]
  "hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8:0d13701bf8d02691": 67083,
  // voter_stake_registry.ledger_transfer_position_v0 (n=1, med=75364, max=75364) [localnet]
  "hvsrNC3NKbcryqDs2DocYHZ9yPKEVzdSjQG6RVtK1s8:060b33935de72723": 75364,
  // lazy_transactions.close_canopy_v0 (n=1, med=2765, max=2765) [localnet]
  "1atrmQs3eq1N2FEYWu6tyTXbCjP4uQwExpjtnhXtS8h:5cbdb0f581ada6a9": 2765,
  // lazy_transactions.set_canopy_v0 (n=1, med=2872, max=2872) [localnet]
  "1atrmQs3eq1N2FEYWu6tyTXbCjP4uQwExpjtnhXtS8h:1956817cb8c38659": 2872,
  // lazy_transactions.update_lazy_transactions_v0 (n=1, med=3604, max=3604)
  "1atrmQs3eq1N2FEYWu6tyTXbCjP4uQwExpjtnhXtS8h:38dfa5f596ecad25": 3604,
  // mobile_entity_manager.initialize_incentive_program_v0 (n=1, med=182270, max=182270) [localnet]
  "memMa1HG4odAFmUbGWfPwS1WWfK95k99F2YTkGvyxZr:ddec50737de071a8": 182270,
  // mobile_entity_manager.update_incentive_program_v0 (n=1, med=3320, max=3320) [localnet]
  "memMa1HG4odAFmUbGWfPwS1WWfK95k99F2YTkGvyxZr:c9012eb54fbf43f4": 3320,
  // hexboosting.close_boost_v1 (n=1, med=3130, max=3130) [localnet]
  "hexbnKYoA2GercNNhHUCCfrTRWrHjT6ujKPXTa5NPqJ:dc96b2aac596d965": 3130,
  // dc_auto_top.close_auto_top_off_v0 (n=1, med=106264, max=106264)
  "topqqzQZroCyRrgyM5zVq6xkFDVnfF13iixSjajydgU:c2d0b1ae6462c4d9": 106264,
  // tuktuk_dca.initialize_dca_nested_v0 (n=1, med=88794, max=88794) [localnet]
  "tdcam4m5U74pEZQrsQ7fVAav4AUXXc6z8fkhvExfRVN:50afa90952dcb70a": 88794,
  // circuit_breaker.update_account_windowed_breaker_v0 (n=1, med=2115, max=2115) [localnet]
  "circAbx64bbsscPbQzZAUvuXpHqrCe6fLMzc2uKXz9g:1b38455f49685612": 2115,
  // treasury_management.update_treasury_management_v0 (n=1, med=2035, max=2035) [localnet]
  "treaf4wWBBty3fHdyBpo35Mz84M8k3heKXmjmi9vFt5:d18b5ae2f99559d9": 2035,
  // fanout.stake_v0 (n=5, med=262516, max=268386) [localnet]
  "fanqeMu3fw8R4LwKNbahPtYXJsyLL6NXyfe2BqzhfB6:04cd34efdfa711d3": 268386,
  // fanout.initialize_fanout_v0 (n=4, med=200250, max=204750) [localnet]
  "fanqeMu3fw8R4LwKNbahPtYXJsyLL6NXyfe2BqzhfB6:f49b9aa5eb7f2cbb": 204750,
  // fanout.unstake_v0 (n=1, med=65264, max=65264) [localnet]
  "fanqeMu3fw8R4LwKNbahPtYXJsyLL6NXyfe2BqzhfB6:c72b785167076870": 65264,
};

export const MAX_COMPUTE_UNITS = 1400000;
// Applied on top of p95 to absorb drift between measurements.
export const FALLBACK_CU_MARGIN = 1.2;

export const COMPUTE_BUDGET_PROGRAM_ID =
  ComputeBudgetProgram.programId.toBase58();

/** Canonical INSTRUCTION_CU_TABLE key: programId + anchor discriminator. */
export const cuTableKey = (programId: string, data: Uint8Array): string =>
  `${programId}:${Buffer.from(data.slice(0, 8)).toString("hex")}`;

// Ubiquitous non-Anchor programs riding along in Helium transactions (ATA
// creates, transfers, memos). They have no 8-byte discriminator — their ix
// data starts with a small index followed by amounts — so they get one
// conservative ceiling per program instead of per-instruction entries.
// Without these, any composite tx would miss the table and request MAX.
const PROGRAM_CU_CEILINGS: Record<string, number> = {
  // System program: transfer/assign ~150 CU, createAccount ~3k.
  "11111111111111111111111111111111": 3000,
  // SPL Token / Token-2022: transfer ~4.6k, transferChecked/mintTo/burn <8k.
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: 10000,
  TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: 12000,
  // Associated Token Account create (CPIs system + token): ~25k.
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: 35000,
  // Memo scales with message length; covers typical short memos.
  MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr: 15000,
};

/**
 * Sum table CU over (programId base58, ix data) pairs, apply
 * FALLBACK_CU_MARGIN. Returns MAX_COMPUTE_UNITS if any instruction is
 * unknown (conservative: the tx still lands).
 */
const sumTableCu = (pairs: [string, Uint8Array][]): number => {
  let total = 0;
  for (const [programId, data] of pairs) {
    if (programId === COMPUTE_BUDGET_PROGRAM_ID) {
      continue;
    }
    const cu =
      INSTRUCTION_CU_TABLE[cuTableKey(programId, data)] ??
      PROGRAM_CU_CEILINGS[programId];
    if (cu === undefined) {
      return MAX_COMPUTE_UNITS;
    }
    total += cu;
  }
  if (total === 0) {
    return MAX_COMPUTE_UNITS;
  }
  return Math.min(MAX_COMPUTE_UNITS, Math.ceil(total * FALLBACK_CU_MARGIN));
};

/**
 * Estimate a compute unit limit for a transaction from the static table,
 * for use when simulation fails.
 */
export const tableComputeUnits = (tx: VersionedTransaction): number =>
  sumTableCu(
    tx.message.compiledInstructions.map((ix) => [
      // Program ids are always in static keys; they cannot be LUT-loaded.
      // A missing key is malformed — "" misses the table and yields MAX.
      tx.message.staticAccountKeys[ix.programIdIndex]?.toBase58() ?? "",
      ix.data,
    ])
  );

/**
 * Same as tableComputeUnits, for un-compiled instruction lists.
 */
export const tableComputeUnitsForInstructions = (
  instructions: TransactionInstruction[]
): number =>
  sumTableCu(instructions.map((ix) => [ix.programId.toBase58(), ix.data]));
