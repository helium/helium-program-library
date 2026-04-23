# generate-test-gateway-txn

CLI helper that constructs a valid Helium gateway (hotspot ECC) `add_gateway` transaction off-device, signed by a test keypair. Useful for exercising [`ecc-sig-verifier`](../ecc-sig-verifier) and the data-only-hotspot issuance flow without physical hardware. You'll likely need to tweak a few bytes to produce exactly the shape the consumer under test expects.

## Example payloads

```
CroBCiEBQ83AI9ItX54QfRoGk0V9NdHRDrfSHHIRkvVvXeQGZdMSIQDTTezWzf7ZF4TZjXUl+4o8HuOB1wUr/LPRyQs/VLCfySJGMEQCIFsUH9lhivqivZg7m+31SVZEgAAK4ZuapWtqdv9vWgqiAiAiQOI6TdRQVjlNon6mX1mSlZW3mtSwRMCMvL1y0eD9nyohAXm1Vi6P5lT5QHixEuipi6eQH4U65pW+1+DjkQutBJZkOICS9AFA6PsD

CroBCiEB7UTmtDnUwT3fGbvn4ASvsi5n6wJiNTs/euxRYXFWiRASIQCIruPASTMtSA87u0hkkApMXY/q2cydP5We1vkyUj9fiSJGMEQCIA46K0Xug+nxpaLi9z25jEI5RtHmWTtvgZFOQBr06jzKAiBifpM+/m/k3SwDAES9FA9QqPv4ElDhh+zCqMbJ15DqYiohAfK7mMA4Bu0mM6e/N81WeNbTEFdgyo4A5g5MgsPQjMazOICS9AFA6PsD

CrsBCiEBQ83AI9ItX54QfRoGk0V9NdHRDrfSHHIRkvVvXeQGZdMSIQBSE5XDRjsZW7Kad8S97uWpQl61Hh2Ipehjm2cE9MF10iJHMEUCIQCJ+n43Jt8zfGXm6yg1dqXE09glwz4Gg72UOyqcdwsRdAIgTVCuCnmPeU6wem99kYIUPrDIpwyBEEhJ7P+4rku13JoqIQF5tVYuj+ZU+UB4sRLoqYunkB+FOuaVvtfg45ELrQSWZDiAkvQBQOj7Aw==
```
