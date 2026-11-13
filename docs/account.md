# Your account

Last verified: 2026-11-12

## What this is for

This page is for the people who use the site: what kinds of account there
are, and how to sign in, get an account, recover one and change a
password. What belongs to an account and what everyone shares is
[catalogue.md](catalogue.md). It carries no
technical detail — how sign-in works underneath is
[authentication.md](authentication.md), and who may see what is
[authorization.md](authorization.md).

Some of what is described here is **not available yet**, and says so where
it appears. Everything else works today.

## Kinds of visitor

- **Not signed in** — you can browse the libraries and the pages they lead
  to. You have no list, no notes, and you see nobody's opinions.
- **Your own account** — a username and password of your own, with your own
  list, ratings and notes. Accounts are by invitation; see
  [Getting an account](#getting-an-account).
- **The admin** — the owner's account. It runs the site and keeps no list or
  notes of its own.

*Not available yet:* **shared accounts** — one login several people use,
handed out by the admin. You will be able to browse and send requests and
reports, but not change its password, and anything sent from it will show
the shared account as its author.

There is no email address or phone number on any account. The only way back
into an account you are locked out of is through the admin.

## What belongs to your account

Your list, ratings, plan, game copies and personal notes are yours; the
works themselves are the shared catalogue. Which is which, section by
section, is [catalogue.md](catalogue.md).

## Signing in

1. Choose **Log in** and enter your username and password.
2. A wrong username and a wrong password get the same message, on purpose.

You stay signed in on that browser until the login expires; then sign in
again.

**Saved usernames.** The sign-in page remembers up to three usernames used on
this browser, so you can pick one instead of typing it. It never remembers a
password. Remove one with its **×**.

**Access mode.** Once signed in, the mode switcher in the header changes how
much of the collection you see, among the modes your account holds.

*Not available yet:*

- you will stay signed in for 30 days, whether or not you use the site in
  between;
- after several failed attempts in a short time you will have to wait
  before trying again;
- an account waiting for approval will be told so after the right password;
  a wrong password will still just say the sign-in failed;
- a disabled account will not be able to sign in until the admin turns it
  back on; nothing in it is lost.

## Getting an account

Today the admin creates your account and gives you the username and
password.

*Not available yet — registering with an invite link:*

1. Ask the admin for an **invite link**. It works once, and only for
   24 hours.
2. Open the link, then choose a username and a password.
3. Your account then **waits for the admin's approval**; you cannot sign in
   yet.
4. Once approved, sign in as usual. If the admin declines it, the account is
   removed and the link cannot be used again — ask for a new one.

**Choosing a username** *(when registering opens)*

- 3 to 32 characters: lowercase letters, digits, `_` and `-`.
- Capital letters count as the same username, so `Kai` and `kai` are one
  name.
- It cannot contain the words `admin` or `guest` anywhere.

**Choosing a password** *(when registering opens)* — it has to meet a
minimum length, and a very long password is refused rather than quietly
shortened. The form says what is wrong.

## Forgot your password or username?

Today, ask the admin, who can set a new password for you.

*Not available yet — reset codes.* There will be no "email me a link": the
site does not know how to reach you.

1. Contact the admin outside the site and ask for a **reset code**.
2. The admin gives you a code (like `K7QM-3XWP`) or a link. It works once,
   and only for 24 hours; a newer code stops an older one working.
3. Open the link, or go to **Log in → Forgot your password or username?**
   and enter the code.
4. The page shows **which username** the code is for — that is how you
   recover a forgotten username.
5. Type a new password twice and save.
6. **You are signed out everywhere**, on every device. Sign in again with
   the new password; the username is filled in for you.

A wrong, expired or already-used code gets one message for all three; ask
the admin for a fresh one. Shared accounts are not reset this way — the
admin changes their password.

## Changing your password

Today, ask the admin.

*Not available yet — changing it yourself:*

1. Open **Settings → Password**.
2. Enter your current password, then the new one twice.
3. Save. You stay signed in, here and on your other devices.

If you think someone else knows your password, ask the admin for a reset
code instead: a reset signs out every device, and a change does not.
Shared accounts have no password setting.

## Signing out

**Log out** ends the session on this browser only. *Not available yet:* a
password reset will sign out every device; there will be no separate "sign
out everywhere".

## For the admin

- **Create an account** — on `/users`, with a username, password, role and
  access modes. It works at once.
- **Set a password** — `/users` sets any account's password.

*Not available yet:*

- **Invite someone** — make an invite link and hand it over. Pending
  registrations wait on `/system`; approving sets the role (`user` by
  default) and the modes (ceiling and default `normal`). Declining removes
  the account.
- **Someone is locked out** — on `/users`, make a **reset code** for their
  account and hand it over. It is shown once.
- **Disable an account** — it cannot sign in and is signed out everywhere;
  its data stays. Enable it again on `/users`.
- **Locked out yourself** — a reset-code command on the box;
  [authentication.md](authentication.md) will have it.
