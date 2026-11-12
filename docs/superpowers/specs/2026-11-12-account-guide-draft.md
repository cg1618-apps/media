# Your account — guide (draft)

**Draft.** This is the user guide for signing in, registering, resetting a
password and changing one, written ahead of the build from
`2026-11-03-account-system-design.md`. Only signing in exists today. When the
account flows ship, this page moves to `docs/account.md`, loses this note and
the draft wording, and is checked against what was actually built. It is for
the people who use the site, so it carries no technical detail; that lives in
`docs/authentication.md`.

---

## Kinds of visitor

- **Not signed in** — you can browse the libraries. You cannot keep a list,
  write notes, or send requests and reports.
- **Your own account** — a username and password of your own, with your own
  lists, ratings and notes.
- **A shared account** — one login that several people use, handed out by the
  admin. You can browse and send requests and reports, but you cannot change
  its password, and anything you send shows the shared account as its author.

There is no email address or phone number on any account. The only way back
into an account you are locked out of is through the admin — see
"Forgot your password or username?".

## Signing in

1. Open **Sign in** and enter your username and password.
2. A wrong username and a wrong password get the same message, on purpose.
3. After several failed attempts in a short time, you have to wait before
   trying again.

You stay signed in for **30 days** on that browser, whether or not you use
the site in between. After that, sign in again.

**Saved usernames.** The sign-in page remembers up to three usernames used on
this browser, so you can pick one instead of typing it. It never remembers a
password. Remove one with its **×**.

**If your account is waiting for approval**, signing in with the right
password tells you so. A wrong password just says the sign-in failed.

**If your account is disabled**, you cannot sign in until the admin turns it
back on. Nothing in it is lost.

## Getting an account

Accounts are by invitation only.

1. Ask the admin for an **invite code**. It works once, and only for
   24 hours.
2. Open **Register**, enter the code, choose a username and a password.
3. Your account now **waits for the admin's approval**. You cannot sign in
   yet.
4. Once approved, sign in as usual. If the admin declines it, the account is
   removed and the code cannot be used again — ask for a new one.

The admin can also create an account for you directly; it works at once.

**Choosing a username**

- 3 to 32 characters: lowercase letters, digits, `_` and `-`.
- Capital letters count as the same username, so `Kai` and `kai` are one
  name.
- It cannot contain the words `admin` or `guest` anywhere.

**Choosing a password** — it has to meet a minimum length, and a very long
password is refused rather than quietly shortened. The form says what is
wrong.

## Forgot your password or username?

There is no "email me a link": the site does not know how to reach you.

1. Contact the admin outside the site and ask for a **reset code**.
2. The admin gives you a code (like `K7QM-3XWP`) or a link. It works once,
   and only for 24 hours. If the admin makes a new one, any older one stops
   working.
3. Open the link, or go to **Sign in → Forgot your password or username?**
   and enter the code.
4. The page shows **which username** the code is for — that is how you
   recover a forgotten username.
5. Type a new password twice and save.
6. **You are signed out everywhere**, on every device. Sign in again with the
   new password; the username is filled in for you.

A wrong, expired or already-used code gets one message for all three. Ask
the admin for a fresh one.

Shared accounts are not reset this way by their users; the admin changes
their password.

## Changing your password

When you know your current password:

1. Open **Settings → Password**.
2. Enter your current password, then the new one twice.
3. Save. You stay signed in, here and on your other devices.

If you think someone else knows your password, ask the admin for a reset
code instead: a reset signs out every device, and a change does not.

Shared accounts have no password setting.

## Signing out

**Sign out** ends the session on this browser only. There is no "sign out
everywhere"; a password reset does that.

---

## For the admin

- **Invite someone** — make an invite code and hand it over. Pending
  registrations wait on `/system` for approval; approving sets the role
  (`user` by default) and the modes (ceiling and default `normal`). Declining
  removes the account.
- **Someone is locked out** — on `/users`, make a **reset code** for their
  account and hand it over. It is shown once.
- **Set a password directly** — `/users` can still set any account's
  password, including the shared accounts'.
- **Disable an account** — it cannot sign in and is signed out everywhere;
  its data stays. Enable it again on `/users`.
- **Locked out yourself** — there is a reset-code command on the box;
  `docs/authentication.md` has it.
