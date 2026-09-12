# Inbound Mail Routing

This runbook documents the routing rules, SLAs, and ownership for the 15 monitored `@letsgetquoted.com` email addresses.

| Address | Group / Destination | Owner | SLA (Business Hours) | Out-of-Hours Behavior |
|---|---|---|---|---|
| `dmarc@` | IT / Security | Operator | 48 hours | Wait for morning |
| `security@` | IT / Security | Operator | 24 hours | Page phone on P0/P1 |
| `privacy@` | Legal / Privacy | Operator | 72 hours (DSAR intake) | Wait for morning |
| `risk@` | Finance / Risk | Operator | 24 hours | Wait for morning |
| `finance@` | Finance | Operator | 48 hours | Wait for morning |
| `support@` | Support Team | Operator | 12 hours | Wait for morning |
| `hello@` | Support Team | Operator | 24 hours | Wait for morning |
| `alerts@` | Ops / SRE | Operator | 4 hours | Page phone |
| `founder@` | Executive | Operator | 48 hours | Wait for morning |
| `ops@` | Ops | Operator | 12 hours | Wait for morning |
| `orders@` | Support / Fulfillment | Operator | 24 hours | Wait for morning |
| `system@` | Ops / SRE | Operator | 12 hours | Wait for morning |
| `tools@` | IT | Operator | 72 hours | Wait for morning |
| `updates@` | Marketing / Prod | Operator | 72 hours | Wait for morning |
| `voice@` | Support | Operator | 24 hours | Wait for morning |

## Actions Required (Operator)

1. Verify `ONCALL_PRIMARY_EMAIL` and `ONCALL_PRIMARY_PHONE` are set in Production and baked into the latest build.
2. Ensure you have sent a dated probe to all 15 addresses from an external mailbox and confirmed receipt.
