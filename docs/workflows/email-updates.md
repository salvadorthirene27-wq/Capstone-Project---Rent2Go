# Opt-in email updates

Rent2Go keeps the in-app inbox independent from email. A verified account holder can opt into generic future-event notices for agency partnership, booking, owner-finance and vehicle updates. The account email and verification flag come from the server-authenticated Neon session, never the request body. Super Admin has no implicit access to another recipient's settings or delivery history. Account-email changes and managed-Auth verification/reset delivery remain part of the separate account-governance/recovery work.

## Preferences and queue

Email is off by default. Saving requires an explicit acknowledgement and the exact current preference version. Enabling also requires a verified session email matching the stored actor email. Disabling remains available when the account email is not verified. Settings are protected by Origin, authentication, actor state, request limits and per-recipient transactional serialization. Audit metadata contains the action/version, not the SMTP password.

Four notification-source INSERT triggers enqueue a message and its first attempt in the same transaction as the original in-app update, only for an existing enabled matching preference. Rollback leaves neither email queue nor original notification. There is no historical delivery backfill. Queue identity pins source notification, original recipient, address and preference version; no original notification body or private document is copied. Attempts and terminal outcomes are retained as immutable history. The runtime's UPDATE(id) privilege on email_message exists solely to permit PostgreSQL row locking; its immutable trigger rejects actual updates.

Saving preferences invalidates earlier queued message versions. Dispatch rechecks actor suspension/fixture status, current email/preference version and current original-source access. Ineligible messages cancel without contacting SMTP. Messages older than seven days expire. A preference withdrawal cannot recall a message already dispatched. Outgoing notices contain only a generic update statement and a configured trusted application-origin sign-in URL; they contain no document, payment proof, amount, booking reason, attachment, remote content or arbitrary HTML.

## Delivery states and retry

| State | Meaning and permitted next step |
| --- | --- |
| Queued | An immutable attempt exists but has not dispatched. It still needs current permission and an enabled operator batch. |
| Sending | Dispatch was durably recorded. A second worker cannot claim the same attempt. |
| Accepted by Gmail | The SMTP server accepted one recipient. This does not prove inbox delivery. |
| Rejected | A definitive SMTP rejection/authentication failure was recorded. The original recipient can explicitly request a new attempt with a stable unique retry key, current permission and source access, up to three total attempts within seven days. |
| Outcome unconfirmed | A connection failed ambiguously or a dispatched job exceeded its two-minute recovery deadline. No automatic or manual resend is permitted from this record. |
| Cancelled | Current permission/source/email changed or the message expired before sending. It is not a delivered email. |

Identical retry keys return saved state and create no duplicate attempt. Cross-message key reuse fails. A recent unfinished attempt cannot be recovered early; interrupted recovery appends UNKNOWN once and never resends. Source/history/attempt/result guards are enforced in PostgreSQL as well as application services.

## Free sender and operation

The Gmail adapter uses smtp.gmail.com:465 with certificate validation and TLS1.2 or later, bounded connection/socket timeouts, no protocol debug logging, and disabled file/URL access. The App Password is kept only in ignored local/server secrets. The Gmail account's own limits apply; application dispatch uses a conservative rolling maximum of100 attempts globally and10 per recipient per24hours, with at least five seconds between dispatches. Counts include unsuccessful dispatches. Database time, a short transaction advisory lock and locked attempt rows enforce limits across concurrent batches. SMTP occurs after commit, with no database row lock held over the external call. Results are recorded afterward. A crash in that gap is treated as unknown, never automatically retried.

Set APP_ORIGIN to the actual HTTPS deployment origin before sending notices from a deployed installation. Local HTTP origins are allowed only for localhost/127.0.0.1. Verify the eventual hosting service supports outbound Gmail SMTP; public deployment remains outside current local-only scope.

- npm run email:verify checks DNS/TLS/authentication only and sends no email.
- npm run email:process processes one batch of at most five records. It also requires EMAIL_SEND_ENABLED=true. It exits without permanent polling; an authorized scheduler/launcher must invoke future batches.
- npm run email:recover closes only expired dispatched attempts as unknown and can run while sending is paused. It sends no email.
- npm run email:self-check deliberately sends one fixed connection-check message only to the configured sender. This is an actual send and must only be run for an authorized check; it does not enable queue dispatch.

At this checkpoint, EMAIL_SEND_ENABLED remains false. One specifically authorized self-check was accepted by Gmail, and the user confirmed Inbox receipt. No other messages were sent. Fixture addresses remain opted out, and no fake delivery history is invented. Managed Neon Auth verification/password-reset emails use their own configuration and require separate live verification; configuring this application sender does not silently configure Auth SMTP.

## Interface and evidence

The existing forest/mint inbox now has a lazy Email updates disclosure above its update list, with named account email, verification/paused-send explanations, acknowledgement, clear save feedback and20-record history pages. Rejected retries are explicit; unknown results offer no resend. Denied refresh clears private settings. Requests abort on unmount, duplicate submits are blocked, failed retries preserve the same key, and saved acknowledgement resets after success/refresh. UI/UX Pro Max guidance informed placement, form feedback, labels and touch targets.

343 unit/interface/route cases in80files pass, plus8 focused interface regressions after moving the disclosure above the update list. Eight isolated queue database cases pass, followed by an expanded actual restricted-role test covering preference save, transactional notification enqueue, dispatch/result recording, rejected retry, cancellation and immutable identity. Seven pre-existing inbox database cases pass. Initial checks found a five-second capacity gate incorrectly postponing permission cancellation, an unsupported test-only toggle helper, and a missing PostgreSQL row-lock grant on immutable messages; all were corrected and affected checks rerun.

Seventeen final-build authenticated HTTP/page checks across four sample roles validate own-only settings, default opt-out/paused dispatch, strict queries/commands, Origin/stale-version protection and unavailable retry denial. Production build and sequential TypeScript pass. Actual1440px desktop,375px phone and812px landscape have no horizontal page overflow; email buttons measure47.1px high. The sample renter saved a disabled preference once; it persisted after reload, acknowledgement cleared, and no email or financial operation was created. A synthetic unverified address cannot enable sending. The account was signed out and protected-workspace redirect verified, temporary tab closed and viewport reset. There is no claim of completed human usability evaluation or full Auth/object restore.

Migration032 is applied to the isolated and application databases. Private application-table exports accompany checkpoints but exclude managed Auth and object bytes. Operational notification launch, actual account recovery, platform remittance, compensating financial adjustments, governance and full-system/restore validation remain separate work.
