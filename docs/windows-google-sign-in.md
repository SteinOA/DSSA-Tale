# Google sign-in configuration for Windows builds

The app now presents **Sign in with Google** as the main action. A publisher desktop OAuth client can be included once when building the app; end users then choose their own account and consent in the system browser. Their tokens remain encrypted in their own local profile. A custom imported client still takes priority. Its import control is under Advanced setup.

No Google client has been registered or included by this change. An unconfigured build explicitly reports that publisher setup is missing and does not pretend that sign-in works. Local Google Drive folders are labelled separately.

## Publisher setup

Register an OAuth client of type Desktop app and enable Drive API. Use an appropriate consent audience and the app's actual scopes. Supply the registered desktop client values to the build environment as `DSSA_GOOGLE_DESKTOP_CLIENT_ID` and `DSSA_GOOGLE_DESKTOP_CLIENT_SECRET`, then use the existing `npm run build:dssa:win` command. The builder validates the pair and embeds only that app configuration in package metadata. No user tokens or profile files are read by this build path. The desktop client value is distributed with the app and must not be treated as a confidential server secret.

The same registered client is available to the existing calendar code through the shared reader, but calendar consent remains separate and needs Calendar API enabled if that feature is used. Do not assume Drive consent grants calendar access.

Current Drive code still requests `openid`, `email`, `drive.readonly` and `drive.file`. Broad read access requires the corresponding consent and potentially Google's verification process; this change does not reduce scopes or establish public-user eligibility. Follow [desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) and [restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification). A shared app client is not access to a shared user account.

This source change does not publish the app or repository. Real login cannot be verified until a valid registration is supplied. Verification should include a new user profile with no imported JSON, account consent, restart/token renewal, file listing/import and disconnect. A user's account or organization may still deny the requested access.

## Validation of this change

On 2026-11-02, 13 targeted tests passed with no failures or skips, including fresh-profile packaged configuration, custom configuration priority, missing/invalid configuration and builder validation. TypeScript checking and the renderer build passed. Changed renderer components and the new test passed ESLint; the helper is excluded by the repository lint configuration and was syntax-checked separately. No actual provider sign-in was attempted, and the currently running packaged v28 application was not replaced or restarted. These changes are in the local source tree and renderer build; a new Windows package is required to use them in the installed app.
