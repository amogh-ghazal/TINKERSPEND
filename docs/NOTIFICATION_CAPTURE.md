# Automatic notification capture

The owner requested this behavior on 25 October 2026. The visual redesign remains deferred; the new controls are functional setup/review controls.

## Setup and collection

After sign-in, the app shows the capture explanation and one **Enable automatic capture** action. This records consent for the signed-in account and opens Android notification-access settings when access is missing. Android grants access to TinkerSpend as a whole, not individually to Google Pay, PhonePe or each bank. Existing users with legacy selected sources must accept the new scope; it is not silently expanded. Switching accounts invalidates the previous account's automatic capture consent. Pause/revoke controls remain available.

When the listener connects, or the user resumes capture, currently visible accessible notifications are imported. New/updated notifications use the same source/filter/encrypted-outbox pipeline. Durable deduplication handles overlapping import/callback deliveries. This is not cleared notification history, SMS-inbox access, direct bank access or a guarantee of every payment.

Eligible sources are the supported bank/UPI package catalog, plus bank-looking sender headers in Google Messages, Samsung Messages and AOSP Messages notifications. Personal conversations and unrelated packages are rejected before persistence. OTPs/promotions are filtered locally. MessagingStyle alerts are split into their visible messages using AndroidX compatibility APIs; unrecognized senders and the phone owner's outgoing replies are excluded. Group summaries/ongoing notifications are excluded. No SMS permission, accessibility service, contact access, UPI PIN or bank login is requested.

The sender-header list is an initial supported-format list, not bank authentication. Actual notification formats remain unverified on physical devices. Android may redact contents; unsupported formats can be missed. Notification access is granted through Android's own settings, and sideloaded apps may also require the OS's restricted-settings approval.

## Register and accounting

Supported payment candidates are logged automatically. Clear supported merchant mappings and explicit purchase evidence can resolve spending; user-saved rules take priority. A bare debit/person transfer is not assumed to be an expense. Own-account transfers, wallet funding, card repayment, cash withdrawal, failed/pending/reversed payments and unlinked refunds are handled separately from confirmed successful spending.

Matching reference + amount + compatible direction links alerts/status updates to one transaction even after its user-entered purpose changes. Explicit UPI numeric UTR and UPI reference forms share a namespace. Opposite-direction legs are preserved. Without a shared reference, a same-payee/value/direction alert within two minutes is a **possible duplicate**, retained in review rather than automatically counted twice or silently deleted. The user can ignore it or explicitly confirm it was separate.

The register shows an **alert timestamp** in the user's timezone. This is notification/message timing, not an independently verified settlement time. A **reported bank** is extracted only from a bank-app identity, recognized SMS sender header or explicit bank name. A UPI app name is not a bank; absent/conflicting bank evidence remains unknown. Raw account numbers are not added as metadata. Timestamp/bank are included in CSV exports; raw notification bodies are not retained in the backend source-event table.

Successful outgoing captures offer **What was this payment for?** in the register. The user can classify spending versus transfer, select a category, add a note, and optionally remember the category for that counterparty. It is an in-app question, not a blocking popup or a new notification permission. Capture continues while it is unanswered. Possible duplicates require an explicit separate-payment confirmation in this short form before counting as spending. Known expenses can count without a note; unknown items remain excluded until resolved.

The visible overview/idle register refresh on return and every minute. Register polling pauses during editing/purpose/refund forms so unsaved input is not replaced. Native collection/sync remains independent of the WebView.

## Evidence

[0.2.0 verification](evidence/codex-020-automatic-capture.md) records synthetic tests, current/new notification collection with `selected=[]`, restart/reboot behavior, local D1 sync and actual native bank/time/purpose display. These are not real UPI, live Google/OpenAI or public-installation results.
