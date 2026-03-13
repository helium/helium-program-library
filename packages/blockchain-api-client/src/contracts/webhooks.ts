import { oc } from "@orpc/contract";
import {
  BridgeWebhookInputSchema,
  BridgeWebhookOutputSchema,
} from "../schemas/webhooks";
import { NOT_FOUND } from "../errors/common";

export const webhooksContract = oc
  .tag("Webhooks")
  .router({
    bridge: oc
      .route({ method: "POST", path: "/webhooks/bridge" })
      .input(BridgeWebhookInputSchema)
      .output(BridgeWebhookOutputSchema)
      .errors({
        NOT_FOUND,
        INVALID_PAYLOAD: { message: "Invalid webhook payload", status: 400 },
      }),
  });
