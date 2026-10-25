# Meta App Review: Mindlap Messaging

Prepared 25 October 2026 for Advanced Access to two permissions on the Meta app **Mindlap Messaging**
(app ID 1528505165963496, business portfolio Mind Lap 3073688956150458). Nothing here has been submitted.

Why: Meta support reported that the CCD number (ending 91552) is eligible for Coexistence, but the app's WhatsApp
review status is Unapproved and it lacks Advanced Access for `whatsapp_business_management` and
`whatsapp_business_messaging`. Both permissions currently show "Ready for testing" (Standard Access) with recorded
test calls, which App Review requires.

Mindlap uses the app only for its own WhatsApp numbers. It is not a tech provider and does not onboard other businesses.

## Where to submit

developers.facebook.com → Mindlap Messaging → Use cases → Connect on WhatsApp → Customize → Permissions and features
→ for each permission choose **Request advanced access** (or App Review → Requests → Edit). Submit both in one request.

## whatsapp_business_management

**How we use it (paste into the request):**

Mindlap is an online counselling practice in Kerala, India. This app connects Mindlap's own WhatsApp Business numbers to
our own booking system at book.mindlap.in. We use whatsapp_business_management to (1) connect our own existing WhatsApp
Business app numbers through Embedded Signup with Coexistence, so our staff keep using the WhatsApp Business app on their
phones; (2) subscribe our app to our own WhatsApp Business Accounts so incoming client messages reach our webhook; and
(3) create and manage our own utility message templates for booking confirmations, session reminders with the online
session join link, and follow-up suggestions from the client's psychologist. We only access WhatsApp Business Accounts
owned by our business portfolio. We do not access or manage assets of any other business.

**What the screen recording shows:**

1. Sign in to book.mindlap.in as an admin. Open Settings → WhatsApp.
2. Show the two cards: Sales number (leads) and CCD number (messages). Explain each in one caption.
3. Press "Connect" on the CCD card. Meta's Embedded Signup window opens; choose the Mind Lap business and
   "Connect your existing WhatsApp Business app". Show the QR step (the phone can be off-camera).
4. Back in the booking app, show the card now reading Connected with the account and number IDs.
5. Open WhatsApp Manager → Message templates and show the three utility templates (booking_confirmation_join,
   booking_reminder_join, follow_up_suggestion) belonging to our own account.

## whatsapp_business_messaging

**How we use it (paste into the request):**

We use whatsapp_business_messaging to send our own clients transactional messages from our own CCD number after they book
a counselling session with Mindlap: a booking confirmation, a reminder before the session with the join link for the online
session, and a follow-up suggestion when their psychologist recommends a next session. Clients reply on the same chat, and our
coordinator answers from the WhatsApp Business app on the phone. We also receive messages from people who contact our sales
number so they can be recorded as enquiries in our booking system. Only approved utility templates are used for messages we
start, and only to people who booked with us or wrote to us first. We do not send marketing messages through this app.

**What the screen recording shows:**

1. In book.mindlap.in, open Settings → Workflows and show the "Booked" WhatsApp workflow using
   booking_confirmation_join and the "1 hour before" reminder using booking_reminder_join.
2. Create a test booking for the opted-in test recipient (a staff phone, not a client).
3. Show the WhatsApp message arriving on that phone from the CCD number with the join link.
4. Reply from the test phone and show the reply arriving in the coordinator's WhatsApp Business app.
5. Show the booking page in the app, with the message marked as sent.

## Recording tips

- 1 to 3 minutes, English captions or voice-over, no client names or clinical details on screen. Use test data only.
- Meta reviewers must be able to see each permission being used; show the Meta windows, not just our own pages.
- If Meta asks for login details for book.mindlap.in, create a temporary reviewer staff account with no client access
  and delete it after the review. Never give a real staff login.

## Order of work

1. Meta support case 28735961256069110: wait for the specialist's answer on a non-destructive way to clear the Marketing
   Messages enrolment on the CCD number. Do not delete or re-register the WhatsApp account without Aflah's decision.
2. The recording for whatsapp_business_messaging needs a working CCD send, which needs the CCD connection and an approved
   template. If Meta will not approve before that, submit with the management recording plus a test send from the
   already-working OTP number, and explain that CCD sending follows the same path.
3. After approval: connect CCD in Settings → WhatsApp, set the permanent sending token on the server, submit the templates,
   send one test to the agreed recipient, and only then turn on the workflows.
