# How we used AI to build SENTRY

SENTRY was built by Team Cosmas (Oladoja Umar-Faruq, Onwudiwe Cosmas Obinna and Hammed Quyum) for Zenith Bank Zecathon 6.0, Track 8: Detecting Emerging Insider Threats.

We used AI tools heavily, and we want to be clear about how. AI wrote a large share of the code and the first drafts of our documents. We decided what to build, checked everything it produced, tested it, went out to talk to people at the bank, and fed what we learned back in. When the AI was wrong, we caught it and changed course. This document explains that process honestly, including the places where our own research overruled the AI.

## The tools and what we used them for

| Tool | What we used it for |
|---|---|
| **OpenAI Codex** | Writing and changing the code: the Next.js app, the detection checks, the database, sign-in and roles, tests, the evaluation harness, the Docker setup. We worked in small, numbered passes. |
| **Anthropic Claude** | Research (news cases, CBN and NDPA rules, how existing insider-risk tools work), reviewing Codex's reports and deciding the next pass, writing the prompts we gave Codex, testing the deployed site in a browser, the pitch deck and our documentation. |
| **GitHub Copilot** | Cleaning up the workspace: listing leftover build folders and removing them only after we approved the exact list. |
| **Google Stitch** | Early screen designs for the analyst console, which we then adjusted to our own design tokens. |

## How we worked

We followed the same loop for almost everything:

1. **We decided the goal.** One change at a time: for example, "a genuine ticket must not clear a wrong-destination refund".
2. **AI drafted it.** Claude helped turn the goal into a precise prompt; Codex wrote the code and the tests.
3. **We checked it.** We read Codex's report, ran the tests and the scripted rehearsal ourselves, and clicked through the result in a browser as each user role.
4. **We brought back what we found.** Bugs, confusing screens, wrong numbers and new information from our research went into the next pass.

Every Codex pass started from a backup with a file manifest, so we could always roll back. We never let one pass change detection logic and the user interface at the same time, so if something broke we knew where to look.

## Where our own research changed the direction

These are the decisions that came from us, not from the AI.

**We visited Zenith branches.** Our first version of the pitch said, in effect, "banks don't check this". Branch staff told us their preventive controls work well and that insider incidents are rare. We took that seriously. We stopped claiming that Zenith's controls are broken and refocused SENTRY on the decision *after* something unusual happens: is this activity justified, and what evidence does a reviewer need before acting?

**A technical guide told us about staff on leave.** When the person with the right permission is away, a colleague covering their case often lacks access to finish it. That conversation became our **Temporary access** feature: one read-only permission, for one customer, on one assigned case, removed when the case is closed. The AI did not suggest this; the bank's own people did.

**The bank told us third parties matter.** Partners connected through the bank's APIs led us to the partner side of SENTRY: for a partner, the reason for an API call is the customer's consent.

**We tested our own product honestly.** We asked for a fair evaluation against simpler approaches instead of a demo that only shows success. It found real problems:
- A genuine support ticket was wrongly clearing a refund that went to the wrong account. We fixed it, and it became one of the strongest moments in our demo: "the ticket is real; the destination is still wrong".
- Our risk threshold missed single, clear contradictions (only 12 of 42 review-worthy test cases were flagged at first). We changed the review policy so a confirmed contradiction always reaches a reviewer.
- A simple "reason plus identity" check matched the full system on our test set. We report that openly rather than claiming SENTRY is better at detection than it has shown.

## AI suggestions we did not follow

- **AI-generated staff for the live feed.** We considered using a language model on our GPU to act as staff. We chose a simple, seeded generator instead, because it is predictable, free and cannot go wrong mid-demo.
- **Vercel with Supabase.** Our app stores its data in files on disk, so serverless hosting would have lost it, and moving to Postgres would have meant rewriting tested code days before the semi-final. We deployed on Render with a persistent disk instead.
- **Unverified claims about real people.** An early draft of our pitch described the $626,282 case as involving "bank customers' funds". The EFCC's own statement does not say that, so we removed it. We also chose not to put the defendant's photo in our deck: he has pleaded not guilty.

## How we checked the AI's work

- **Automated tests:** 95 tests covering the checks, permissions, approvals and scenarios, run after every pass.
- **Scripted rehearsal:** a script that replays the full story and must produce the exact expected scores every time (6; 38, 38, 64, 81; 35, 55, 70, 85; 35).
- **Browser walkthroughs:** we signed in as each role on the live site and went through the whole flow ourselves, including on a phone screen.
- **Fact-checking:** every number in our pitch was checked against its original source, such as the EFCC's official posts, and the source is listed in the deck.
- **Real problems, real fixes:** when the hosted site ran out of memory on start-up, we read the server logs, found the cause and had the data generation rewritten to use far less memory, then confirmed it at 512 MB.

## What AI did not do

- It did not choose the problem, the users or the product direction. Those came from the challenge brief, our branch visits and the feedback we received.
- It never saw real customer or bank data. Everything in SENTRY is synthetic.
- It never saw our secrets. Environment files and keys stayed out of every prompt.
- It did not approve its own work. Nothing was kept until it passed our tests and our own review.

## What we learned

AI let a small team build much more than we could have done alone in a few days. It was most useful when we gave it one clear, narrow task and then checked the result properly. It was least useful, and sometimes wrong, when we let it guess about the real world. The best changes to SENTRY came from talking to people at the bank and testing our own claims, then using AI to build what we learned.

Team Cosmas, October 2026
