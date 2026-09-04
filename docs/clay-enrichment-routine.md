# Building a Clay enrichment routine

Job Search Terminal finds people through Clay's search API, but **search never returns
email addresses**. Getting one requires a second step Clay calls a *routine*.

There is no way around this. Clay's Public API has no "find this person's email" endpoint —
the only path is executing a routine, and routines live in your Clay workspace, not here.
JST deliberately does not create routines or tables on your behalf.

---

## Before you start

- Clay connected in **Settings → Integrations** (status reads *Connected*)
- A scoped API key with the **Public API** scope — the personal `clay_user_…` key is
  rejected, see `docs/features.md`
- Awareness that this spends credits: **per person enriched**, at the same rate as doing
  the work inside Clay

---

## Two ways to get a routine id

### Option A — Clay's managed function (recommended; verified working)

You do not write any logic. Clay ships **Enrich Person and Find Contact Details**, which
chains ~18 email providers (Findymail, Hunter, Prospeo, Dropcontact, and more) with Clay's
own API keys, then validates the result.

1. **Functions** in the left nav → **+ New** → the *Browse Clay managed functions* dialog
2. Search **email** → choose **Enrich Person and Find Contact Details**
3. **Setup as managed** → *Required API keys*: leave every provider on its
   "Clay-managed … account" default → **Continue**
4. *Tools*: tick **API & CLI** — this is the step that makes it callable from Job Search
   Terminal. Leave *MCP for reps* unticked.
5. **Entity type defaults to `Company`. Change it to `Contact`.** You are enriching a
   person, not an employer.
6. **Continue** → *Access permissions* → **Add to workspace**

The function appears with status **Live** and *API & CLI: Enabled*.

**Cost: 12.8 credits per person.** That is the single most important number here — see
[Staying on the free tier](#staying-on-the-free-tier).

**Finding the id.** Clay's UI has no "copy id" control and the Public API has no endpoint
that lists routines. The id is embedded in the Functions page — open it and read the `t_…`
value out of the page source. The full id is that value prefixed with `function:`, so it
looks like `function:t_XXXXXXXXXXXXXXXXX`.

Routine ids are specific to your workspace. Treat one like a credential: keep it in
Settings, not in a file you commit.

> Do **not** use *Edit configuration* just to hunt for the id. It prompts to detach the
> function from Clay's managed updates, and that cannot be undone.

### Option B — a custom function

Only if the managed function does not fit. Ids also look like `function:t_…`. Build it to
take a LinkedIn URL and return a work email.

---

## What JST sends, and what it expects back

This is the contract your routine has to satisfy.

**Inputs** — one item per person, up to 100 per run:

```json
{
  "items": [
    { "id": "jst-0", "inputs": { "Social Profile URL": "https://linkedin.com/in/jane-doe" } }
  ]
}
```

Note the input key is the literal label **`Social Profile URL`** — spaces and capitals, not
a snake_case key. That is how Clay's managed function declares it; sending `linkedin_url`
is rejected with *"Missing required field"*. A custom function you build yourself will use
whatever label you give it, so match this one or adjust the app.

Nothing else is sent. Not your resume, not your notes, not your gap answers.

**A note on what comes back.** The managed function returns a full enriched profile —
education, employment history, and a **mobile phone number** — alongside the work email.
JST stores only the email and discards the rest, but the data does cross the wire.

**Output** — JST prefers a field whose *name* mentions email (the managed function returns
`Work Email`), and falls back to the first email-shaped value anywhere in the response. The
name-first pass matters because the returned profile can contain other addresses; a blind
first-match walk could pick the wrong one.

A custom routine can name the field anything and still work.

---

## Validate it before saving

Do not paste an id into Settings and hope. Test it:

```bash
npm run clay:routine -- function:t_your_routine_id
```

It sends exactly what the app sends, polls until the run settles, and tells you whether an
email came back and **where in the response it was found**. Override the sample person with
someone whose email Clay is likely to have:

```bash
npm run clay:routine -- function:t_your_routine_id --linkedin=https://linkedin.com/in/someone --domain=company.com
```

This runs the routine for real and spends one person's enrichment credit.

Reading the result:

| Output | Meaning |
|---|---|
| `✅ Email found at $.…` | Works. Paste the id into Settings → Integrations |
| `⚠️ completed but no email-shaped value` | The routine ran but found nothing for that person. Try someone else before changing the routine — JST matches any field name, so this is usually a miss rather than a mapping problem |
| `❌ failed inside Clay` | A step errored. Open the run in Clay to see which |
| `Still running` | Not a failure. A single-person run against the managed function takes ~15-35s; the app waits up to 60s |
| `HTTP 404` | Wrong routine id |

---

## Wire it up

1. **Settings → Integrations → Enrichment routine id** — paste the id, save.
2. Leave **Look up emails automatically for search results** off at first. Use **Find
   email** on individual contacts to confirm real-world behaviour.
3. Turn automatic lookup on once you trust it. Every person a search returns is then
   enriched in a single routine run — one API call, but still one credit per person.

---

## Staying on the free tier

Credits go to **people enriched** and **search results returned**, not to API calls.
Batching saves round trips, not money.

Enrichment is by far the most expensive thing here: **12.8 data credits per person**, so a
full five-result search auto-enriched costs **64 credits**.

Check your actual allowance at **Usage → Overview → Workspace balances** before deciding.
Clay meters two things separately — *data credits* (enrichment) and *actions* (API calls) —
and the numbers differ a lot by plan. A trial workspace observed in August 2026 carried
**2,000 data credits and 10,000 actions, both recurring bi-weekly**, which is roughly 154
enriched people or 30 auto-enriched searches per cycle. That is ample. Do not assume it:
a trial allowance is temporary, and the figure after conversion is what you will actually
live with.

Rules of thumb:

- **Comfortable allowance** — turning automatic lookup on is reasonable
- **Tight allowance** — leave it off and use **Find email** on the one or two people you
  actually intend to contact: 12.8 credits instead of 64
- One people-search click runs three targeted searches capped at five results total (2 + 2 + 1) and never auto-paginates
- Connection testing uses Clay's identity endpoint and consumes nothing

---

## Why Job Search Terminal uses the API instead of Clay MCP

It would avoid building a routine, since Clay's MCP server exposes its own find-and-enrich
tools. It was evaluated on 2026-08-18 and not adopted: Clay charges the same credits over
MCP as over the API — *"there is no surcharge for arriving over MCP"* — while requiring
OAuth 2.0 with PKCE, Dynamic Client Registration and hourly token refresh. Same cost, far
more machinery.

The Clay connection shown in Job Search Terminal is therefore the scoped API-key connection,
not the Clay MCP session in ChatGPT. Contact search still uses a three-part search plan —
hiring leaders, nearby team leaders and a recruiter — but requests no more than five results
in total and does not send the full job description or private career material to Clay.
