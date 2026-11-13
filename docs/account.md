# Your account

Last verified: 2026-11-13

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

What each kind of visitor will be able to see, page by page, is
[viewers.md](viewers.md).

There is no email address or phone number on any account. The only way back
into an account you are locked out of is through the admin.

## What belongs to your account

Your list, ratings, plan, game copies and personal notes are yours; the
works themselves are the shared catalogue. Which is which, section by
section, is [catalogue.md](catalogue.md).

## Requests and reports

If something is missing, wrong or broken, tell the admin from inside the
site.

1. On an entry, group, studio, publisher, person or character page, choose
   **Report a problem**. The request is then about that page. For anything
   else, open **Requests** in the header and choose **New request**.
2. Pick what kind it is: a new entry request, a data error, incomplete data,
   a bug, or something else. Describe it, and add a remark if you like. For
   a bug, you can give the address of the page where it happened.
3. **Requests** in the header lists your own requests, each with its status
   (open, done or declined) and any answer from whoever handled it.

While a request is open you can change its description and remark. Once
it is done or declined it is locked. You cannot delete a request.

You can have only a limited number of requests open at once (15 for a new
account). When you reach it, wait until one is handled. Nobody else sees
your requests except the admin and the owner's account, which handle them.

## Signing in

1. Choose **Log in** and enter your username and password.
2. A wrong username and a wrong password get the same message, on purpose.

You stay signed in on that browser for **30 days**, whether or not you use
the site in between; then sign in again.

**Too many wrong attempts.** After several failed sign-ins in a short time,
you have to wait before trying again. The message says how long. A
correct password does not skip the wait.

**A disabled account** cannot sign in until the admin turns it back on.
Nothing in it is lost. You only learn it is disabled after typing the
right password; a wrong one just says the sign-in failed.

**Saved usernames.** The sign-in page remembers up to three usernames used on
this browser, so you can pick one instead of typing it. It never remembers a
password. Remove one with its **×**.

**Access mode.** Once signed in, the mode switcher in the header changes how
much of the collection you see, among the modes up to your account's
ceiling.

*Not available yet:* an account waiting for approval will be told so after
the right password; a wrong password will still just say the sign-in
failed.

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

**Choosing a username.** These rules apply to every new username, whoever
sets it:

- 3 to 32 characters: lowercase letters, digits, `_` and `-`.
- Capital letters count as the same username, so `Kai` and `kai` are one
  name.
- It cannot contain the words `admin` or `guest` anywhere.

**Choosing a password.** Anything you like, as long as it is not empty. An
extremely long one (over 72 bytes) is refused rather than quietly
shortened. The form says what is wrong. The same applies wherever a
password is set.

## Forgot your password or username?

Ask the admin for a **reset link**. There is no "email me a link": the site
does not know how to reach you.

1. Contact the admin outside the site and ask for a **reset link**.
   **Log in → Forgot your password or username?** says the same.
2. The admin gives you a link. It works once, and only for 24 hours; a
   newer link stops an older one working.
3. Open it. The page shows **which username** it is for — that is how you
   recover a forgotten username.
4. Type a new password twice and save.
5. **You are signed out everywhere**, on every device. Sign in again with
   the new password; the username is filled in for you.

A wrong, expired or already-used link gets one message for all three; ask
the admin for a fresh one. Shared accounts are not reset this way — the
admin changes their password.

## Changing your password

1. Open **Settings → Password**.
2. Enter your current password, then the new one twice.
3. Save. You stay signed in, here and on your other devices.

If you think someone else knows your password, ask the admin for a reset
link instead: a reset signs out every device, and a change does not.
Shared accounts have no password setting.

## Signing out

**Log out** ends the session on this browser only. A password reset signs
out every device, and so does the admin setting your password or
disabling your account. There is no separate "sign out everywhere".

## For the admin

- **Create an account** — on `/users`, with a username, password, role and
  access modes. It works at once.
- **Set a password** — `/users` sets any account's password, and signs
  that account out everywhere. Setting your **own** password there keeps
  this browser signed in and signs out your other devices.
- **Someone is locked out** — on `/users`, make a **reset link** for their
  account and hand it over. It is shown once. A shared account gets no
  reset link; set its password instead.
- **Disable an account** — it cannot sign in and is signed out everywhere;
  its data stays. Enable it again on `/users`. You cannot disable your own
  account.
- **Locked out yourself** — run the reset-link command on the box, as
  given in [authentication.md](authentication.md), and open the link it
  prints.

*Not available yet:* **invite someone** — make an invite link and hand it
over. Pending registrations wait on `/system`; approving sets the role
(`user` by default) and the modes (ceiling and default `normal`).
Declining removes the account.
