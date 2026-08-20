import type { EmailSummary } from "./graph.js";

/**
 * Stand-ins for real Graph API responses, same shape as EmailSummary.
 * Purpose: unblock Milestone 2+ (classification, workflow routing) while
 * Microsoft account/tenant access is sorted out separately. Swapping
 * this out for real getMessages() calls later requires no changes to
 * classify.ts, workflowMap.ts, or the routing logic in index.ts --
 * only index.ts's data source line changes.
 */
export const MOCK_EMAILS: EmailSummary[] = [
  {
    id: "mock-1",
    subject: "Invoice for August Services",
    from: "billing@vendor-example.com",
    receivedDateTime: "2026-08-15T09:12:00Z",
    bodyPreview:
      "Please find attached the invoice for services rendered in August. Payment due within 30 days.",
    hasAttachments: true,
    attachments: [{ name: "invoice-august.pdf", contentType: "application/pdf", size: 84213 }],
  },
  {
    id: "mock-2",
    subject: "URGENT: Customer escalation - order #4471",
    from: "support-lead@example.com",
    receivedDateTime: "2026-08-19T14:03:00Z",
    bodyPreview:
      "Customer is threatening to cancel their contract over a repeated delivery failure. Need a response today.",
    hasAttachments: false,
    attachments: [],
  },
  {
    id: "mock-3",
    subject: "Signed offer letter - Jane Doe",
    from: "hr@example.com",
    receivedDateTime: "2026-08-14T11:40:00Z",
    bodyPreview: "Attached is the countersigned offer letter for the new Analyst role, start date Sept 1.",
    hasAttachments: true,
    attachments: [{ name: "offer-letter-jane-doe.pdf", contentType: "application/pdf", size: 51022 }],
  },
  {
    id: "mock-4",
    subject: "Team lunch next Friday?",
    from: "colleague@example.com",
    receivedDateTime: "2026-08-18T16:20:00Z",
    bodyPreview: "Thinking of organizing a team lunch next Friday if enough people are free. Thoughts?",
    hasAttachments: false,
    attachments: [],
  },
  {
    id: "mock-5",
    subject: "Vendor contract renewal - review needed",
    from: "legal@example.com",
    receivedDateTime: "2026-08-13T08:55:00Z",
    bodyPreview:
      "The annual contract with our cloud provider is up for renewal. Please review the attached redline before Thursday.",
    hasAttachments: true,
    attachments: [{ name: "contract-redline.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 39877 }],
  },
];
