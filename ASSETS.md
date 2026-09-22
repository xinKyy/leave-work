# Asset manifest

## Animated characters

The two character models are from Quaternius' **Ultimate Modular Characters Pack**. The pack page identifies the assets as CC0, with the license linked to the Creative Commons CC0 1.0 Universal public-domain dedication.

- Pack page: https://quaternius.com/packs/ultimatemodularcharacters.html
- Official Google Drive folder: https://drive.google.com/drive/folders/1qpSIycVWTwhKMgyA_bEFHPh1CfBBBa09
- License: https://creativecommons.org/publicdomain/zero/1.0/

### `public/assets/player.gltf`

- Original filename: `Casual_Hoodie.gltf`
- Official Drive file ID: `1em1So1xwwQNfHJYMvzKcXkZllvtxpKP5`
- Size: 3,104,001 bytes
- SHA-256: `dd74886c26998a0fa888b4ce557a0932d7d97b0265dd4c763154d081b7a6cb98`

### `public/assets/manager.gltf`

- Original filename: `Suit.gltf`
- Official Drive file ID: `1NhXHnGU0zK9hBrT5FoZp8nTz_EmvTPg5`
- Size: 3,315,342 bytes
- SHA-256: `6c89fbb31b96c1a63ad94e3dee0942bd7b34bc789a5d39fd6a6a1738a9214fb3`

## Runtime notes

Both files are glTF 2.0 JSON with their binary buffer embedded as a base64 data URI. They have no external buffer or texture dependencies. Each contains one skinned armature and these 24 animation clips:

`Death`, `Gun_Shoot`, `HitRecieve`, `HitRecieve_2`, `Idle`, `Idle_Gun`, `Idle_Gun_Pointing`, `Idle_Gun_Shoot`, `Idle_Neutral`, `Idle_Sword`, `Interact`, `Kick_Left`, `Kick_Right`, `Punch_Left`, `Punch_Right`, `Roll`, `Run`, `Run_Back`, `Run_Left`, `Run_Right`, `Run_Shoot`, `Sword_Slash`, `Walk`, `Wave`.

The models use meter-like units and stand about 1.86-1.87 units tall in their authored pose. Start with a Three.js scale of `1`; adjust only to match the game's world scale. The aggregate accessor bounds are approximately 1.68 x 1.87 x 0.38 for the hoodie and 1.76 x 1.86 x 0.37 for the suit. The broad X bound includes posed/extended geometry, so use height as the primary scale reference and compute a post-load `Box3` if precise collision bounds are needed.
