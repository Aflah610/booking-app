# Creator OTP migration to the booking app

Reviewed Creator on 26 October 2026: Mindlap Booking Engine > Workflow > Functions.
No Creator function or request record was changed. Credentials and actual codes are excluded.

## Observed rules

- Send_OTP generates six digits, stores a request/reference, sets Created and zero attempts, records a maximum of
  five attempts, and sends the Meta Authentication template mindlap_verification_code in English with Copy Code.
- Send_OTP stores a ten-minute expiry, but Verify_OTP actually rejects after five minutes. Preserve the effective
  five-minute lifetime consistently in the booking app.
- Verify_OTP selects the latest Created record, increments attempts and last verification time, and marks success
  Verified. It does not enforce its recorded maximum. Older Created codes can become eligible again.
- The migration enforces five guesses, permanently replaces old requests, and applies atomic resend limits.
  Codes stay hashed instead of being stored/debug-logged as plaintext. Raw Meta errors are not exposed.
- Admin reporting includes request number, reference, phone, status, attempts, created/expiry/sent/verified/last-attempt.

## Delivery and cutover

- Creator uses Meta Graph v25.0 and the same OTP sender currently configured on Cloudflare. Reuse its configuration
  securely on the booking server. This is separate from the CCD number and needs no account deletion.
- The website retains /api/otp/send and /api/otp/verify on Cloudflare. The Worker applies phone/IP limits and calls
  booking-app /api/v1/otp using a dedicated OTP-only API key. It stores only the current phone/reference association.
- The booking app owns generation, hashed storage, expiry, attempts, direct Meta delivery and the admin report.
- Only a successful phone/reference-matched verification can issue the existing 24-hour website session token.
  Keep SESSION_TOKEN_SECRET unchanged to preserve current logins.
- OTP_PROVIDER=booking must never fall back to Creator or issue a session on timeouts, invalid replies or storage failures.
- Provision OTP_META_API_URL, OTP_META_TOKEN, OTP_TEMPLATE_NAME and OTP_TEMPLATE_LANGUAGE on the server.
  BOOKING_OTP_API_KEY stays in Cloudflare Worker secrets, never browser code or the repo.
- Test delivery and verification and confirm the request in the booking-app report before calling cutover complete.
  Existing Creator history stays intact. Do not record keys, live codes or test phone numbers in this document.
