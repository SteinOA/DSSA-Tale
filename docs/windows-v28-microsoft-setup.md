# Microsoft connection setup for private v28 testing

Checked 2026-11-02 against `src/helpers/dssaMicrosoft.js` and shared `oauthLoopbackFlow.js`. This is the registration contract expected by today's code, not a record of a completed registration. No Entra application, tenant permission or account was changed. The repository and review remain private.

## Registration expected by the code

1. An authorized owner creates an app registration in Microsoft Entra. Use [Microsoft's registration guide](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app). This document is setup guidance, not authorization to change the user's tenant.
2. Configure a public desktop/native client under **Mobile and desktop applications** with redirect URI `http://localhost`. DSSA Tale uses authorization code with PKCE through the system browser; no client secret is used. Its loopback listener chooses a free port and the callback has no additional path. Microsoft's localhost matching ignores the ephemeral port. See [desktop configuration](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-desktop-app-configuration) and [redirect rules](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url).
3. Match supported accounts to the application's `/common` authorization/token endpoints. For the unchanged full connection, an organizational multitenant registration is the relevant work/school configuration. A tenant-specific authority would require a code change. Adding personal-account support at registration does not prove that the complete SharePoint permission set works for personal accounts; that combination is unverified. See [supported audiences](https://learn.microsoft.com/en-us/entra/identity-platform/v2-supported-account-types). An organization may prohibit multitenant apps or user consent; obtain its decision instead of bypassing policy.
4. Review the delegated permissions below. Do not add application permissions for unattended tenant-wide access: the code acts as the signed-in user. Identity scopes are requested in the authorization flow. Configure the applicable Microsoft Graph delegated permissions and consent policy with the registration owner.
5. Copy **Application (client) ID**, a public GUID, into DSSA Tale's Microsoft connection field. No password or secret belongs in that field. The local app requests consent through the provider, reads `/me`, and saves encrypted tokens only after a successful response. A successful browser login elsewhere does not supply this app's authorization.

## Exact request and reasons

The fixed request is `openid profile offline_access User.Read Calendars.Read Files.ReadWrite.All Sites.Read.All`.

| Scope | Role in the current connection |
| --- | --- |
| `openid profile` | Sign-in identity information. |
| `offline_access` | Refresh-token request for access renewal. |
| `User.Read` | Reads the signed-in user's display name from `/me`. |
| `Calendars.Read` | Calendar view used by the existing meeting/calendar screen. |
| `Files.ReadWrite.All` | Broad delegated file read/write, including files the user can access; upload sessions need write access. Not limited to audio or files created by DSSA Tale. |
| `Sites.Read.All` | Reads accessible SharePoint site content and supports site/library discovery. Not limited to a pinned site. |

The [Graph permission reference](https://learn.microsoft.com/en-us/graph/permissions-reference) defines these grants. Tenant consent policy can require administrator approval even where a permission permits user consent. Requested authorization is broader than the app's exposed actions; a new-file/rename upload policy is not an OAuth restriction against other file operations. Delegated access does not grant rights beyond the signed-in user's own access. Exact necessity for every endpoint has not been established by real-account testing.

## Alternatives and current scope

Synced OneDrive/SharePoint folders avoid new Graph consent in this app and are the smallest route when files are already local. Read-only Graph would omit upload capability. `Files.ReadWrite` is narrower for the user's own files but cannot simply be assumed sufficient for shared drives/sites. Selected-resource authorization or a separate calendar/file consent flow would change today's browsing and connection design. Those are possible future changes, not implemented fallbacks.

For this private v28 review, document the fixed combined request and keep its use optional. Do not grant every scope merely because the app requests it: the registration owner must accept the breadth for the intended account and organization. If unacceptable, use synchronized folders. Reducing scopes requires endpoint-by-endpoint validation and corresponding code changes; it cannot be accomplished by documentation alone.

## Required functional verification

Actual registration, sign-in and file operations remain unverified. With an explicitly approved test registration, verify callback handling, accepted scopes, calendar read, intended drive/site listing, selected audio download, confirmed new-document upload, token renewal and disconnect. Record the account type and tenant policy outcome. The existing six Microsoft helper tests use mocked responses; their passing result does not establish provider consent or API access.

No setup step was executed during the architecture review. No client secret is required by this implementation, and none should be sent in chat.

## Shared client and simplified sign-in added after the review

The connection now appears directly in Settings → Connections as **OneDrive / SharePoint**, with **Sign in with Microsoft** as the main action. The optional custom client-ID field is under Advanced setup. Local synchronized folders are labelled separately.

The publisher can supply `DSSA_MICROSOFT_DESKTOP_CLIENT_ID` to the existing `npm run build:dssa:win` command. The builder validates the GUID and embeds the public ID as `dssaMicrosoftDesktopClientId` in package metadata. No client secret is used. On a fresh profile, the service uses this default. A previously selected per-profile ID takes priority, so existing refresh tokens keep using their original registration. Successful sign-in continues to save the selected client ID and encrypted user tokens locally.

No registration or default ID was created by this source change. An unconfigured edition explains the missing publisher setup; the app does not claim that the account is connected. A shared client does not bypass organizational consent or establish support for every account type. The registration and functional checks above still apply. This change does not publish the repository, change requested permissions, or replace the currently running Windows package.

Validation on 2026-11-02: 23 targeted Microsoft, Google client, Drive and connection tests passed with zero failures/skips. Coverage includes a fresh profile using publisher metadata, preservation of the custom client ID during token refresh, missing/invalid IDs and packaging both providers together. TypeScript checking, renderer build, changed renderer/test ESLint, helper syntax checks and `git diff --check` passed. Existing build/lint warnings remain. Actual Microsoft account sign-in was not exercised and no tenant was changed. A new Windows package with an approved registration is still needed for installed-app use.
