# Recovery goes through the admin, and nothing signs out everywhere

What is deliberately not built around signing in:

- **No email address or phone number on an account**, so no self-service
  recovery: the site has no way to reach anyone. Recovery is a link the admin
  issues and hands over, and it recovers a forgotten username as well, because
  the page it opens says which account it is for.
- **No in-app "forgot my password" request.** A signed-out form identifies
  nobody, and the link it would ask for still has to be handed over outside the
  app, so the request saves no step. The sign-in page's link opens a note
  saying to ask the admin.
- **No public way to the register page**, so nobody reaches it only to find
  they cannot register without an invite.
- **No "sign out everywhere" and no admin force-logout.** Sessions end on a
  spent reset link, the admin setting a password, and disabling the account,
  and those cover the cases: someone knows my password, a leaked shared login,
  an account to cut off.
- **No sliding refresh.** A login lasts 30 days from sign-in, used or not.
