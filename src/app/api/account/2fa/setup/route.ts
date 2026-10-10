import QRCode from "qrcode";
import { route, json } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { beginTwoFactorSetup } from "@/server/auth/service";

export const POST = route(async () => {
  const { user } = await requireApiAuth({ verified: false });
  const { secret, otpauthUrl } = await beginTwoFactorSetup(user.id);
  const qrSvg = await QRCode.toString(otpauthUrl, { type: "svg", margin: 1, width: 192 });
  return json({ secret, otpauthUrl, qrSvg });
});
