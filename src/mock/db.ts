/**
 * In-memory database for the mock API. Seeded on page load; changes last until reload.
 */
import type { Audience, Channel, EventSummary, Snippet, Template, Variable } from "../api/types";

export type DbVariable = Variable & { sample?: unknown };

export interface DbEvent extends EventSummary {
  variables: DbVariable[];
  audiences: Audience[];
}

export interface DbService {
  namespace: string;
  code: string;
  name: string;
  description?: string;
  active: boolean;
  events: DbEvent[];
}

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const ALL: Channel[] = ["sms", "email", "inApp"];
const customer: Audience = { code: "customer", name: "Customer", channels: ALL };
const sender: Audience = { code: "sender", name: "Sender", channels: ALL };
const receiver: Audience = { code: "receiver", name: "Receiver", channels: ["sms", "inApp"] };
const ops: Audience = { code: "operations", name: "Operations team", channels: ["email"] };

const v = (
  name: string,
  type: Variable["type"],
  required: boolean,
  description: string,
  sample?: unknown,
): DbVariable => ({ name, type, required, description, sample });

const services: DbService[] = [
  {
    namespace: "payments",
    code: "FUND_TRANSFER",
    name: "Fund Transfer",
    description: "Transfers between Dashen accounts and to other banks.",
    active: true,
    events: [
      {
        code: "TRANSFER_COMPLETED",
        name: "Transfer completed",
        description: "Money left the sender's account and reached the receiver.",
        active: true,
        variables: [
          v("senderName", "text", true, "Full name of the sender", "Abebe Kebede"),
          v("receiverName", "text", true, "Full name of the receiver", "Almaz Tesfaye"),
          v("amount", "money", true, "Amount transferred, in ETB", 2500),
          v("fee", "money", false, "Service charge, if any", 5),
          v("senderAccount", "account", true, "Debited account", "5012345678901"),
          v("receiverAccount", "account", true, "Credited account", "5098765432101"),
          v("reference", "text", true, "Transaction reference", "FT26291ABX42"),
          v("completedAt", "datetime", true, "When the transfer completed"),
        ],
        audiences: [sender, receiver],
      },
      {
        code: "TRANSFER_FAILED",
        name: "Transfer failed",
        description: "The transfer was rejected or reversed.",
        active: true,
        variables: [
          v("senderName", "text", true, "Full name of the sender", "Abebe Kebede"),
          v("amount", "money", true, "Amount attempted, in ETB", 2500),
          v("reason", "text", false, "Why it failed", "insufficient balance"),
          v("reference", "text", true, "Transaction reference", "FT26291ABX42"),
          v("failedAt", "datetime", true, "When it failed"),
        ],
        audiences: [sender, ops],
      },
    ],
  },
  {
    namespace: "payments",
    code: "BILL_PAYMENT",
    name: "Bill Payment",
    description: "Utility, school fee and telecom bill payments.",
    active: true,
    events: [
      {
        code: "BILL_PAID",
        name: "Bill paid",
        active: true,
        variables: [
          v("customerName", "text", true, "Customer's name", "Hana Girma"),
          v("biller", "text", true, "Who was paid", "Ethiopian Electric Utility"),
          v("amount", "money", true, "Amount paid, in ETB", 845.5),
          v("billNumber", "text", true, "Bill or contract number", "EEU-0042-7781"),
          v("paidAt", "datetime", true, "Payment time"),
        ],
        audiences: [customer],
      },
      {
        code: "BILL_DUE",
        name: "Bill due reminder",
        active: false,
        variables: [
          v("customerName", "text", true, "Customer's name", "Hana Girma"),
          v("biller", "text", true, "Biller", "Ethio Telecom"),
          v("amount", "money", true, "Amount due", 399),
          v("dueDate", "datetime", true, "Due date"),
        ],
        audiences: [customer],
      },
    ],
  },
  {
    namespace: "wallet",
    code: "AIRTIME_TOPUP",
    name: "Airtime Top-up",
    description: "Mobile airtime and packages bought from the app.",
    active: true,
    events: [
      {
        code: "TOPUP_SUCCESS",
        name: "Top-up successful",
        active: true,
        variables: [
          v("phone", "phone", true, "Topped-up number", "0911223344"),
          v("amount", "money", true, "Airtime amount", 100),
          v("balance", "money", false, "Remaining wallet balance", 12450.75),
          v("toppedUpAt", "datetime", true, "Time of top-up"),
        ],
        audiences: [customer],
      },
    ],
  },
  {
    namespace: "wallet",
    code: "CASH_OUT",
    name: "Agent Cash-out",
    description: "Withdrawals at Dashen agents.",
    active: false,
    events: [
      {
        code: "CASH_OUT_COMPLETED",
        name: "Cash-out completed",
        active: true,
        variables: [
          v("agentName", "text", true, "Agent name", "Bole Mini Market"),
          v("amount", "money", true, "Amount withdrawn", 3000),
          v("completedAt", "datetime", true, "Time of withdrawal"),
        ],
        audiences: [customer],
      },
    ],
  },
  {
    namespace: "security",
    code: "AUTH",
    name: "Authentication",
    description: "Sign-in, one-time passwords and device changes.",
    active: true,
    events: [
      {
        code: "OTP_REQUESTED",
        name: "One-time password",
        active: true,
        variables: [
          v("otp", "text", true, "The 6-digit code", "482913"),
          v("validMinutes", "number", true, "Minutes the code stays valid", 5),
        ],
        audiences: [customer],
      },
      {
        code: "NEW_DEVICE_LOGIN",
        name: "Sign-in from a new device",
        active: true,
        variables: [
          v("customerName", "text", true, "Customer's name", "Hana Girma"),
          v("device", "text", true, "Device model", "Samsung Galaxy A54"),
          v("location", "text", false, "Approximate location", "Addis Ababa"),
          v("loggedInAt", "datetime", true, "Sign-in time"),
        ],
        audiences: [customer],
      },
    ],
  },
  {
    namespace: "lending",
    code: "MICRO_LOAN",
    name: "Micro Loan",
    description: "Small digital loans.",
    active: true,
    events: [
      {
        code: "LOAN_APPROVED",
        name: "Loan approved",
        active: true,
        variables: [
          v("customerName", "text", true, "Customer's name", "Hana Girma"),
          v("amount", "money", true, "Approved amount", 5000),
          v("dueDate", "datetime", true, "Repayment date"),
          v("account", "account", true, "Credited account", "1000123456789"),
        ],
        audiences: [customer],
      },
      {
        code: "REPAYMENT_DUE",
        name: "Repayment due",
        active: true,
        variables: [
          v("customerName", "text", true, "Customer's name", "Hana Girma"),
          v("amount", "money", true, "Amount due", 5150),
          v("dueDate", "datetime", true, "Due date"),
          v("daysLeft", "number", true, "Days until due", 3),
        ],
        audiences: [customer],
      },
    ],
  },
];

const snippetSeed: Array<[string, string, string, number]> = [
  [
    "signature",
    "Closing line used in emails.",
    "Thank you for banking with Dashen Bank.",
    60 * 24 * 12,
  ],
  ["helpline", "Call-centre line.", "For help, call 6333 (free).", 60 * 24 * 9],
  [
    "notYou",
    "Fraud warning for security messages.",
    "If this wasn't you, call 6333 immediately and never share your PIN or OTP.",
    60 * 24 * 3,
  ],
];

type Seed = [string, string, string, Channel, string | undefined, string, boolean, number];

const templateSeed: Seed[] = [
  [
    "FUND_TRANSFER",
    "TRANSFER_COMPLETED",
    "sender",
    "sms",
    undefined,
    "Dear {{senderName}}, ETB {{amount}} sent to {{receiverName}} ({{receiverAccount}}) on {{completedAt}}.{{#if fee}} Fee: ETB {{fee}}.{{/if}} Ref {{reference}}. {{> helpline}}",
    true,
    45,
  ],
  [
    "FUND_TRANSFER",
    "TRANSFER_COMPLETED",
    "sender",
    "email",
    "Transfer of ETB {{amount}} completed",
    "Dear {{senderName}},\n\nYour transfer of ETB {{amount}} from {{senderAccount}} to {{receiverName}} ({{receiverAccount}}) completed on {{completedAt.date}} at {{completedAt.time}}.\n{{#if fee}}Service charge: ETB {{fee}}\n{{/if}}Reference: {{reference}}\n\n{{> signature}}",
    true,
    60 * 26,
  ],
  [
    "FUND_TRANSFER",
    "TRANSFER_COMPLETED",
    "receiver",
    "sms",
    undefined,
    "You received ETB {{amount}} from {{senderName}} to {{receiverAccount}}. Ref {{reference}}.",
    true,
    60 * 5,
  ],
  [
    "FUND_TRANSFER",
    "TRANSFER_COMPLETED",
    "receiver",
    "inApp",
    "Money received",
    "{{senderName}} sent you ETB {{amount}}.",
    false,
    60 * 50,
  ],
  [
    "FUND_TRANSFER",
    "TRANSFER_FAILED",
    "sender",
    "sms",
    undefined,
    "Your transfer of ETB {{amount}} failed{{#if reason}}: {{reason}}{{/if}}. No money was taken. Ref {{reference}}.",
    true,
    60 * 72,
  ],
  [
    "BILL_PAYMENT",
    "BILL_PAID",
    "customer",
    "sms",
    undefined,
    "ETB {{amount}} paid to {{biller}} for bill {{billNumber}} on {{paidAt.date}}. {{> helpline}}",
    true,
    60 * 8,
  ],
  [
    "AIRTIME_TOPUP",
    "TOPUP_SUCCESS",
    "customer",
    "sms",
    undefined,
    "{{phone}} topped up with ETB {{amount}}.{{#if balance}} Balance: ETB {{balance}}.{{/if}}",
    true,
    60 * 30,
  ],
  [
    "AUTH",
    "OTP_REQUESTED",
    "customer",
    "sms",
    undefined,
    "Your Dashen verification code is {{otp}}. It expires in {{validMinutes}} minutes. Never share it with anyone.",
    true,
    60 * 24 * 20,
  ],
  [
    "AUTH",
    "NEW_DEVICE_LOGIN",
    "customer",
    "email",
    "New sign-in to your Dashen account",
    "Dear {{customerName}},\n\nYour account was signed in on {{device}}{{#if location}} near {{location}}{{/if}} at {{loggedInAt}}.\n\n{{> notYou}}\n\n{{> signature}}",
    true,
    60 * 24 * 2,
  ],
  [
    "AUTH",
    "NEW_DEVICE_LOGIN",
    "customer",
    "inApp",
    "New sign-in",
    "Signed in on {{device}} at {{loggedInAt.time}}. {{> notYou}}",
    true,
    60 * 24 * 2,
  ],
  [
    "MICRO_LOAN",
    "LOAN_APPROVED",
    "customer",
    "sms",
    undefined,
    "Congratulations {{customerName}}! Your loan of ETB {{amount}} was credited to {{account}}. Repay by {{dueDate.date}}.",
    true,
    60 * 24 * 6,
  ],
];

export const slotId = (service: string, event: string, audience: string, channel: string) =>
  `${service} / ${event} / ${audience} / ${channel}`;

export const db = {
  services,
  snippets: new Map<string, Snippet>(
    snippetSeed.map(([key, description, body, age]) => [
      key,
      { key, description, body, createdAt: ago(age + 600), updatedAt: ago(age) },
    ]),
  ),
  templates: new Map<string, Template>(
    templateSeed.map(([service, event, audience, channel, subject, body, active, age]) => [
      slotId(service, event, audience, channel),
      {
        service,
        event,
        audience,
        channel,
        ...(subject === undefined ? {} : { subject }),
        body,
        active,
        createdAt: ago(age + 60 * 24 * 7),
        updatedAt: ago(age),
      },
    ]),
  ),
};
