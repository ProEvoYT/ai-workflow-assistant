# Email Sort PoC

AI-powered email prioritisation and document routing, built against a
personal/school mailbox first, structured so it can migrate to an
enterprise (MTN) environment by editing configuration -- not rewriting
code.

**Status:** Milestones 1-2 complete (auth + read, classification).
No writes/actions yet -- see Roadmap below.

## Architecture

```
Outlook (test folder)
      │
      ▼
Microsoft Graph API        <- src/auth.ts, src/graph.ts
      │
      ▼
LLM classification         <- src/classify.ts
      │
      ▼
Structured JSON
 { priority, category, document_type, requires_action, confidence }
      │
      ▼
Workflow map (config)      <- src/workflowMap.ts
      │
      ▼
Destination + review flag
      │
      ▼
[Milestone 3: actions -- move email, save attachment]
```

**Core design principle:** the AI decides *what* something is
(category, priority, type). Your code decides *where that goes*
(destination path), by looking the category up in `workflowMap.ts`.
This keeps the model's output small and constrained (an enum, not free
text), and means changing destinations later is a config edit, not a
prompt or logic change.

## Setup

### 1. Register an app in Entra ID

Using your personal/school Microsoft account:

1. Go to [entra.microsoft.com](https://entra.microsoft.com) (or
   [portal.azure.com](https://portal.azure.com)) → **App registrations**
   → **New registration**.
2. Name: anything, e.g. `email-sort-poc`.
3. Supported account types: whichever your account allows (org-only, or
   org + personal).
4. No redirect URI needed.
5. Note the **Application (client) ID** and **Directory (tenant) ID**.

### 2. Add API permissions

**App registration → API permissions → Add a permission → Microsoft
Graph → Delegated permissions**, add:

- `Mail.ReadWrite`
- `Mail.Read`
- `User.Read`

These are delegated + user-consentable -- you approve them for yourself
on first sign-in. No admin action needed. Don't add Application
(app-only) permissions for this PoC; those need admin consent and
aren't necessary for reading your own mailbox.

### 3. Create a test folder in Outlook

Create a folder called `AI-Demo` (or whatever `MAIL_TEST_FOLDER_NAME`
is set to) directly under your mailbox root or Inbox. Drop a handful of
sample emails in there -- mix of subjects/senders, some with PDF/image
attachments, a couple that should plausibly hit different categories
(finance, HR, "other"). **Never point this at your live Inbox.**

### 4. Get a Gemini API key

Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
and create a free key -- no credit card required. This is what performs
the classification step in place of Copilot Studio's Classify action --
see project notes for why. The free tier is generous enough to cover
testing against the sample data many times over.

### 5. Configure environment

```bash
cp env.example.txt .env.example   # if pushing to git, keep this name
cp env.example.txt .env           # your actual local secrets
```

Fill in `MS_CLIENT_ID`, `MS_TENANT_ID`, and `GEMINI_API_KEY` in
`.env`. `.env` is gitignored -- never commit it. For mock mode
(`npm run start:mock`), only `GEMINI_API_KEY` is needed.

### 6. Install and run

```bash
npm install
npm start
```

First run shows a device code and URL -- open the URL, enter the code,
sign in as yourself. The script then prints each email's fields
alongside its AI classification and resolved destination.

## Pushing to GitHub / GitHub Copilot

```bash
git init
mv env.example.txt .env.example   # standard naming for a committed template
git add .
git commit -m "Milestones 1-2: Graph auth/read + LLM classification"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

`.gitignore` already excludes `.env`, `node_modules/`, and `dist/`.
Double-check `git status` shows no `.env` before your first commit --
GitHub Copilot (and anyone else) should only ever see `.env.example`.

## Portability: what changes when this moves to MTN

Everything Microsoft-specific lives in `src/config.ts`, driven by
`.env`. Moving from a personal/school mailbox to MTN's tenant should be
a **configuration change**:

| Aspect | Personal/school (now) | MTN (later) | Where it changes |
|---|---|---|---|
| Tenant ID | `common` or school tenant | MTN's tenant ID | `.env` only |
| Client ID | Your own app registration | MTN's app registration | `.env` only |
| Permissions | Delegated, self-consented | Same scopes, same pattern, for reading *your own* mailbox | No change |
| Test folder | `AI-Demo` under your mailbox | Same pattern, different mailbox | `.env` only |
| Destinations | `workflowMap.ts` placeholder paths | Real SharePoint site/library paths MTN provides | `workflowMap.ts` only |

**What would need new code, not just config:**

- **Shared/other-user mailboxes** -- needs admin-consented delegated
  scopes or app-only permissions, an admin decision on MTN's side. This
  becomes a second auth provider alongside `auth.ts`, not a replacement.
- **Writing to real SharePoint document libraries** -- `Files.ReadWrite`
  covers it, but site/library IDs are MTN-specific; worth its own
  config section when you get there (Milestone 3+).
- **Teams notifications / approvals** -- likely needs org consent for
  channel-posting scopes. Plan to simulate/log this for the demo rather
  than wire it live.

## Roadmap

- [x] **Milestone 1** -- authenticate, read real emails + attachment metadata.
- [x] **Milestone 2** -- classify each email via LLM into structured JSON;
      resolve destination via config; flag low-confidence/unknown
      categories as needs-review.
- [ ] **Milestone 3** -- act on the classification: move the email,
      extract and save the attachment to the resolved destination.
- [ ] **Milestone 4** -- generalize across more categories/edge cases;
      handle multiple attachments per email; basic run logging.
- [ ] **Milestone 5** -- polish for demo: sample dataset, README
      screenshots/output capture, short write-up of the MTN migration path.