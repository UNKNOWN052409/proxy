# Bulk Authorized Credential Import

The administrator import workflow accepts **only credentials and account records that the administrator is authorized to manage**. Every API key, bearer token, OAuth access token, and refresh token is encrypted before persistence. Preview and response payloads expose metadata and counts only; they never echo supplied secret values.

> Passwords, password hashes, cookies, browser-session values, private headers, authorization-header dumps, and captured traffic are rejected before storage. The importer is not a browser-session conversion or traffic-interception feature.

| File type | Accepted structure | Provider selection |
|---|---|---|
| JSON | `credentials`, `tokens`, `apiKeys`, `accounts`, or `connections` arrays | Set top-level `provider` or set `provider` per record. |
| CSV | Header plus one entry per row. Use `provider` and `apiKey`, `key`, `token`, `accessToken`, or `refreshToken`. | `provider`, `providerId`, or `service` column is required. |
| Text | One bearer token or API key per non-comment line. | Enter a default provider ID in the import form. |

## JSON examples

```json
{
  "provider": "kiro",
  "credentials": [
    { "label": "paid key", "apiKey": "REDACTED" },
    { "label": "issued token", "token": "REDACTED", "expiresAt": "2026-12-31T00:00:00Z" }
  ],
  "accounts": [
    {
      "email": "owner@example.com",
      "accessToken": "REDACTED",
      "refreshToken": "REDACTED",
      "label": "official OAuth account"
    }
  ]
}
```

A compatible connection record may contain `cliProxyAuth.accessToken` and `cliProxyAuth.refreshToken`. Only those documented token fields, the provider, the optional email, and allowed metadata are carried forward.

## CSV example

```csv
provider,token,label,expiresAt
kiro,REDACTED,paid Kiro token,2026-12-31T00:00:00Z
openai,REDACTED,production key,
```

## Operational behavior

The uploader performs a server-side dry-run validation before the administrator confirms encryption and import. A file can contain at most **500 entries** and may not exceed **5 MB**. Invalid or unsafe rows are reported as rejected without being saved; eligible rows can still be imported. Each provider credential pool retains its existing per-provider capacity controls.

Use the **Revalidate file** action after changing the selected file format or default provider ID. For plain `.txt` token lists, a provider ID is mandatory because raw token strings carry no provider identity.
