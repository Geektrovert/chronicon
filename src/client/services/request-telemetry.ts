import { Context, Effect } from "effect";
import type { HttpMethod } from "effect/unstable/http/HttpMethod";
import { requestContext, type TelemetryProperties } from "../telemetry";

export const ActionTelemetry = Context.Reference<TelemetryProperties | undefined>(
  "chronicon/ActionTelemetry",
  {
    defaultValue: () => undefined,
  },
);

export const prepareRequestTelemetry = (input: {
  method: HttpMethod;
  route: string;
  sampled: boolean;
}) =>
  Effect.gen(function* () {
    const correlation = requestContext(input.sampled);
    const action = yield* ActionTelemetry;

    const fields = {
      request_id: correlation.requestId,
      trace_id: correlation.traceId,
      span_id: correlation.spanId,
      method: input.method,
      route: input.route,
    };

    if (action) Object.assign(action, fields);

    return { headers: correlation.headers, fields, action };
  });
