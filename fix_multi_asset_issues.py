import os
BASE = r'C:\Users\USER\Tokenized-Fractional-'
CONTRACT_PATH = os.path.join(BASE, 'contracts', 'multi_asset', 'src', 'lib.rs')

with open(CONTRACT_PATH, 'r', encoding='utf-8') as f:
    content = f.read()

# ====== Fix 1: Helper functions - replace panic_with_error! with panic! ======
content = content.replace(
    'fn checked_add_u32(a: u32, b: u32) -> u32 {\n    a.checked_add(b).unwrap_or_else(|| panic_with_error!(&Map::new(&Default::default()), Error::InvalidAmount))\n}',
    'fn checked_add_u32(a: u32, b: u32) -> u32 {\n    a.checked_add(b).expect("checked_add_u32 overflow")\n}'
)

content = content.replace(
    'fn checked_sub_u32(a: u32, b: u32) -> u32 {\n    a.checked_sub(b).unwrap_or_else(|| panic_with_error!(&Map::new(&Default::default()), Error::InvalidAmount))\n}',
    'fn checked_sub_u32(a: u32, b: u32) -> u32 {\n    a.checked_sub(b).expect("checked_sub_u32 underflow")\n}'
)

content = content.replace(
    'fn checked_mul_i128(a: i128, b: i128) -> i128 {\n    a.checked_mul(b).unwrap_or_else(|| panic_with_error!(&Map::new(&Default::default()), Error::InvalidAmount))\n}',
    'fn checked_mul_i128(a: i128, b: i128) -> i128 {\n    a.checked_mul(b).expect("checked_mul_i128 overflow")\n}'
)

# Remove unused Map import
content = content.replace('Map, ', '')

# ====== Fix 2: list_assets_by_status pagination ======
content = content.replace(
    'let skipped = start;\n\n        while i <= count && collected < limit {\n            if let Some(info) = env.storage().persistent().get::<DataKey, AssetInfo>(&DataKey::AssetInfo(i)) {\n                if info.status == status {\n                    if skipped > 0 {\n                        // skip first `start` matches\n                    } else {\n                        result.push_back(info);\n                        collected += 1;\n                    }\n                }\n            }\n            i += 1;\n        }',
    'let mut to_skip = start;\n\n        while i <= count && collected < limit {\n            if let Some(info) = env.storage().persistent().get::<DataKey, AssetInfo>(&DataKey::AssetInfo(i)) {\n                if info.status == status {\n                    if to_skip > 0 {\n                        to_skip -= 1;\n                    } else {\n                        result.push_back(info);\n                        collected += 1;\n                    }\n                }\n            }\n            i += 1;\n        }'
)

# ====== Fix 3: Enforce restrictions in buy_asset_shares ======
content = content.replace(
    '        let restrictions: AssetRestrictions = env.storage().persistent()\n            .get(&DataKey::AssetRestrictions(asset_id))\n            .expect("Restrictions not found");\n\n        // Check lockup',
    '        // Enforce restrictions\n        let restrictions: AssetRestrictions = env.storage().persistent()\n            .get(&DataKey::AssetRestrictions(asset_id))\n            .expect("Restrictions not found");\n\n        if amount < restrictions.min_investment {\n            panic_with_error!(&env, Error::InvalidAmount);\n        }\n\n        let existing_balance: u32 = env.storage().persistent()\n            .get(&DataKey::AssetBalance(asset_id, buyer.clone()))\n            .unwrap_or(0);\n        let prospective = existing_balance.saturating_add(amount);\n        if restrictions.max_per_investor > 0 && prospective > restrictions.max_per_investor {\n            panic_with_error!(&env, Error::NotAuthorized);\n        }\n\n        // Check lockup'
)

# ====== Fix 4: max_per_investor check in transfer_asset_shares ======
content = content.replace(
    '        let new_to = checked_add_u32(to_balance, amount);\n\n        env.storage()',
    '        let new_to = checked_add_u32(to_balance, amount);\n        if restrictions.max_per_investor > 0 && new_to > restrictions.max_per_investor {\n            panic_with_error!(&env, Error::NotAuthorized);\n        }\n\n        env.storage()'
)

with open(CONTRACT_PATH, 'w', encoding='utf-8') as f:
    f.write(content)

print("All 4 fixes applied successfully")
print(f"File length: {len(content)} chars")
