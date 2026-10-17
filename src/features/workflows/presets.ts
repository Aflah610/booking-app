import type { WorkflowInput } from "./workflows.schemas";

/** Starting points shown as cards when creating a workflow; the admin edits them before saving. */
export const PRESETS: { key: string; title: string; blurb: string; input: WorkflowInput }[] = [
  {
    key: "confirmation",
    title: "Booking confirmation",
    blurb: "Email the client as soon as they book.",
    input: {
      name: "Booking confirmation (email)",
      trigger: "booked",
      action: {
        channel: "email",
        recipient: "client",
        attachInvite: true,
        subject: "Your {{service}} is confirmed",
        body: "Hi {{client_name}},\n\nYour {{service}} with {{staff}} is confirmed for {{date}} at {{time}}.\nBooking ID: {{booking_id}}\nWhere: {{location}}\nJoin online: {{meeting_link}}\n\nPLEASE ADD IT TO YOUR CALENDAR\nPress \"Yes\" on the calendar invitation at the top of this email and it is added to your calendar.\nOr add it yourself:\nGoogle Calendar: {{add_to_google}}\nOutlook: {{add_to_outlook}}\n\nNeed to change it? {{manage_link}}\n\nThank you,\n{{firm_name}}",
      },
    },
  },
  {
    key: "reminder-email",
    title: "Reminder the day before",
    blurb: "Email 24 hours before the appointment starts.",
    input: {
      name: "Reminder 24 hours before (email)",
      trigger: "appointment_start",
      timing: "before",
      offsetMin: 24 * 60,
      action: {
        channel: "email",
        recipient: "client",
        subject: "Reminder: {{service}} tomorrow at {{time}}",
        body: "Hi {{client_name}},\n\nA reminder of your {{service}} with {{staff}} on {{date}} at {{time}}.\nBooking ID: {{booking_id}}\nWhere: {{location}}\n\nReschedule or cancel: {{manage_link}}\n\n{{firm_name}}",
      },
    },
  },
  {
    key: "reminder-whatsapp",
    title: "WhatsApp reminder",
    blurb: "WhatsApp message one hour before. Uses the approved booking_reminder template.",
    input: {
      name: "Reminder 1 hour before (WhatsApp)",
      trigger: "appointment_start",
      timing: "before",
      offsetMin: 60,
      action: {
        channel: "whatsapp",
        templateName: "booking_reminder",
        language: "en",
        params: ["{{client_name}}", "{{service}}", "{{staff}}", "{{date}} at {{time}}", "{{booking_id}}"],
      },
    },
  },
  {
    key: "cancelled",
    title: "Cancellation notice",
    blurb: "Tell the client when their booking is cancelled.",
    input: {
      name: "Booking cancelled (email)",
      trigger: "cancelled",
      action: {
        channel: "email",
        recipient: "client",
        attachInvite: true,
        subject: "Your {{service}} has been cancelled",
        body: "Hi {{client_name}},\n\nYour {{service}} on {{date}} at {{time}} (booking {{booking_id}}) has been cancelled.\n\n{{firm_name}}",
      },
    },
  },
  {
    key: "follow-up",
    title: "Thank-you after the visit",
    blurb: "Email two hours after the appointment ends.",
    input: {
      name: "Thank you after appointment (email)",
      trigger: "appointment_end",
      timing: "after",
      offsetMin: 120,
      action: {
        channel: "email",
        recipient: "client",
        subject: "Thank you for visiting {{firm_name}}",
        body: "Hi {{client_name}},\n\nThank you for your {{service}} with {{staff}}. We hope to see you again.\n\n{{firm_name}}",
      },
    },
  },
  {
    key: "payment-failed",
    title: "Complete your payment",
    blurb: "Email when a booking's payment didn't arrive in 15 minutes, with a link to finish within 24 hours.",
    input: {
      name: "Payment not received (email)",
      trigger: "payment_failed",
      action: {
        channel: "email",
        recipient: "client",
        subject: "Complete your {{service}} booking",
        body: "Hi {{client_name}},\n\nWe didn't receive your payment of {{amount}} for your {{service}} on {{date}} at {{time}}, so we have released the time.\n\nYou can still finish within 24 hours of booking: {{resume_link}}\n\n{{firm_name}}",
      },
    },
  },
  {
    key: "payment-received",
    title: "Payment received",
    blurb: "Email a receipt as soon as the payment is confirmed.",
    input: {
      name: "Payment received (email)",
      trigger: "payment_success",
      action: {
        channel: "email",
        recipient: "client",
        attachInvite: true,
        subject: "Payment received for your {{service}}",
        body: "Hi {{client_name}},\n\nThank you. We received {{amount}} for your {{service}} on {{date}} at {{time}}.\nBooking ID: {{booking_id}}\n\n{{firm_name}}",
      },
    },
  },
  {
    key: "custom",
    title: "Custom: send to my system",
    blurb: "POST every new booking as JSON to your own URL (CRM, sheet, billing…).",
    input: { name: "Send new bookings to my system", trigger: "booked", action: { channel: "webhook", url: "https://" } },
  },
];
