import { Context, Effect, Layer } from "effect";
import { AppConfig } from "../config";
import {
  requireEmailDelivery,
  sendResourceInvitationEmail,
  sendTeamInvitationEmail,
  sendVerificationEmail,
} from "../email";

function makeEmailDelivery(config: AppConfig["Service"]) {
  // Keep config and the functions that unwrap its Redacted values in the same
  // module graph when Next shares this service across pages and route handlers.
  return {
    requireConfigured: () => requireEmailDelivery(config),
    sendVerification: (input: Parameters<typeof sendVerificationEmail>[1]) =>
      sendVerificationEmail(config, input),
    sendTeamInvitation: (input: Parameters<typeof sendTeamInvitationEmail>[1]) =>
      sendTeamInvitationEmail(config, input),
    sendResourceInvitation: (input: Parameters<typeof sendResourceInvitationEmail>[1]) =>
      sendResourceInvitationEmail(config, input),
  };
}

export class EmailDelivery extends Context.Service<
  EmailDelivery,
  ReturnType<typeof makeEmailDelivery>
>()("chronicon/server/EmailDelivery") {
  static readonly layer = Layer.effect(EmailDelivery, Effect.map(AppConfig, makeEmailDelivery));
}
