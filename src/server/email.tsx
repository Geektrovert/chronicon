import { Redacted, Schema } from "effect";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Text,
  render,
} from "react-email";
import type { CreateEmailOptions } from "resend";
import type { AppConfig } from "./config";
import { AppError } from "./errors";
import { logOperationalError } from "./observability";

type EmailContent = {
  title: string;
  description: string;
  action: string;
  url: string;
  footer: string;
};

const providerErrorSchema = Schema.Struct({
  name: Schema.optionalKey(Schema.String),
  message: Schema.String,
});
const providerReceiptSchema = Schema.Struct({ id: Schema.String });

// The SDK logs raw provider errors in development. Keep the fixed Resend endpoint
// and validate its response here so logs never include message content or headers.
function deliverEmail(config: AppConfig["Service"], payload: CreateEmailOptions) {
  // oxlint-disable-next-line effecttsgo/global-fetch -- Better Auth requires a Promise; this fixed provider boundary validates responses and suppresses SDK logging.
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${Redacted.value(config.resendApiKey)}`,
      "Content-Type": "application/json",
      "User-Agent": "chronicon/0.1.0",
    },
    body: JSON.stringify(payload),
  }).then((response) =>
    response
      .json()
      .catch(() => null)
      .then((body: unknown) => {
        if (response.ok) {
          if (!Schema.is(providerReceiptSchema)(body))
            throw new Error("Missing email delivery receipt");
          return { error: null };
        }
        const error = Schema.is(providerErrorSchema)(body)
          ? body
          : { name: "provider_error", message: "" };
        return {
          error: { ...error, name: error.name ?? "provider_error", statusCode: response.status },
        };
      }),
  );
}

function AccountEmail({ title, description, action, url, footer }: EmailContent) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{title}</Preview>
      <Body
        style={{
          backgroundColor: "#f6f5f2",
          color: "#242321",
          fontFamily: "Arial, sans-serif",
          padding: "32px 16px",
        }}
      >
        <Container
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            maxWidth: "520px",
            padding: "32px",
          }}
        >
          <Text style={{ color: "#76716a", fontSize: "13px", letterSpacing: "1px" }}>
            CHRONICON
          </Text>
          <Heading as="h1" style={{ fontSize: "24px", fontWeight: "600", lineHeight: "32px" }}>
            {title}
          </Heading>
          <Text style={{ fontSize: "15px", lineHeight: "24px" }}>{description}</Text>
          <Button
            href={url}
            style={{
              backgroundColor: "#242321",
              borderRadius: "6px",
              color: "#ffffff",
              fontSize: "14px",
              padding: "12px 20px",
            }}
          >
            {action}
          </Button>
          <Text style={{ color: "#76716a", fontSize: "12px", lineHeight: "20px" }}>
            Or open this link:{" "}
            <Link href={url} style={{ color: "#504838", overflowWrap: "anywhere" }}>
              {url}
            </Link>
          </Text>
          <Hr style={{ borderColor: "#eae7e1", marginTop: "28px" }} />
          <Text style={{ color: "#76716a", fontSize: "12px", lineHeight: "20px" }}>{footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}

export function requireEmailDelivery(config: AppConfig["Service"]) {
  if (!Redacted.value(config.resendApiKey) || !config.resendFromEmail) {
    logOperationalError("Email delivery failed", { stage: "configuration" });
    throw new AppError({
      status: 503,
      message: "Email delivery is unavailable. Contact the workspace administrator.",
    });
  }
}

function sendEmail(config: AppConfig["Service"], email: string, content: EmailContent) {
  requireEmailDelivery(config);
  return render(<AccountEmail {...content} />)
    .catch(() => {
      logOperationalError("Email delivery failed", { stage: "render" });
      throw new AppError({
        status: 502,
        message:
          "The verification email could not be prepared. Contact the workspace administrator.",
      });
    })
    .then((html) =>
      deliverEmail(config, {
        from: config.resendFromEmail,
        to: email,
        subject: content.title,
        html,
        text: `${content.title}\n\n${content.description}\n\n${content.action}: ${content.url}\n\n${content.footer}`,
      }).catch(() => {
        logOperationalError("Email delivery failed", { stage: "transport" });
        throw new AppError({
          status: 502,
          message:
            "Email delivery could not be confirmed. Check the invitation before sending it again.",
        });
      }),
    )
    .then((result) => {
      if (result.error) {
        const allowedNames = [
          "invalid_idempotency_key",
          "validation_error",
          "missing_api_key",
          "invalid_api_key",
          "restricted_api_key",
          "rate_limit_exceeded",
          "daily_quota_exceeded",
          "monthly_quota_exceeded",
          "application_error",
          "internal_server_error",
          "invalid_access",
          "not_found",
          "method_not_allowed",
          "invalid_idempotent_request",
          "concurrent_idempotent_requests",
          "invalid_attachment",
          "invalid_from_address",
          "invalid_parameter",
          "invalid_region",
          "missing_required_field",
          "security_error",
        ];
        const code = allowedNames.includes(result.error.name)
          ? result.error.name
          : "provider_error";
        const providerMessage = result.error.message.toLowerCase();
        const domainNotVerified =
          providerMessage.includes("domain") &&
          (providerMessage.includes("not verified") || providerMessage.includes("unverified"));
        const senderNotAllowed =
          (providerMessage.includes("sender") ||
            providerMessage.includes("from address") ||
            providerMessage.includes("from_address")) &&
          (providerMessage.includes("not allowed") ||
            providerMessage.includes("not permitted") ||
            providerMessage.includes("not authorized") ||
            providerMessage.includes("restricted"));
        const keyDomainRestricted =
          providerMessage.includes("domain") && providerMessage.includes("restricted");
        logOperationalError("Email delivery failed", {
          stage: "provider",
          code,
          statusCode: result.error.statusCode ?? 502,
          domainNotVerified,
          senderNotAllowed,
          keyDomainRestricted,
        });
        throw new AppError({
          status: 502,
          message:
            result.error.statusCode >= 500
              ? "Email delivery could not be confirmed. Check the invitation before sending it again."
              : domainNotVerified
                ? "The sender domain is not verified in Resend. Contact the workspace administrator."
                : keyDomainRestricted || senderNotAllowed
                  ? "The Resend key does not allow this sender. Contact the workspace administrator."
                  : "The email provider rejected this message. Contact the workspace administrator.",
        });
      }
    });
}

export function sendVerificationEmail(
  config: AppConfig["Service"],
  input: { email: string; url: string },
) {
  return sendEmail(config, input.email, {
    title: "Verify your email for Chronicon",
    description:
      "Verify this email address to accept invitations and share projects and documents with other people.",
    action: "Verify email",
    url: input.url,
    footer:
      "This link expires in one hour. If you did not create an account or request verification, you can ignore this email.",
  });
}

export function sendTeamInvitationEmail(
  config: AppConfig["Service"],
  input: { email: string; inviterName: string; teamName: string; url: string },
) {
  return sendEmail(config, input.email, {
    title: `Join ${input.teamName} on Chronicon`,
    description: `${input.inviterName} invited you to their team. Sign in or create an account using ${input.email} to accept. Projects are shared with you separately.`,
    action: "View invitation",
    url: input.url,
    footer:
      "This invitation expires in seven days. If you were not expecting it, you can ignore this email.",
  });
}

export function sendResourceInvitationEmail(
  config: AppConfig["Service"],
  input: {
    email: string;
    inviterName: string;
    resourceName: string;
    resourceType: "project" | "document";
    url: string;
  },
) {
  return sendEmail(config, input.email, {
    title: `${input.inviterName} shared ${input.resourceName} with you`,
    description: `You have been invited to a ${input.resourceType} on Chronicon. Sign in or create an account using ${input.email}, then verify your email to access it.`,
    action: `Open ${input.resourceType}`,
    url: input.url,
    footer: "If you were not expecting this invitation, you can ignore this email.",
  });
}
