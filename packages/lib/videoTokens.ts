import { createHmac } from "node:crypto";
import process from "node:process";

const DEFAULT_TOKEN_TTL_MINUTES = 262992; // 6 months

function getTokenSecret(): string {
  return process.env.CAL_VIDEO_RECORDING_TOKEN_SECRET || "default-secret-change-me";
}

function signPayload(payload: string): string {
  return createHmac("sha256", getTokenSecret()).update(payload).digest("hex");
}

export function generateVideoToken(recordingId: string, expiresInMinutes = DEFAULT_TOKEN_TTL_MINUTES) {
  const expires = Date.now() + expiresInMinutes * 60;
  const payload = `${recordingId}:${expires}`;

  return `${payload}:${signPayload(payload)}`;
}

export function verifyVideoToken(token: string): {
  valid: boolean;
  recordingId?: string;
} {
  try {
    const [recordingId, expires, receivedHmac] = token.split(":");

    if (Date.now() > Number.parseInt(expires, 10)) {
      return { valid: false };
    }

    const expectedHmac = signPayload(`${recordingId}:${expires}`);

    if (receivedHmac && receivedHmac !== expectedHmac) {
      return { valid: false };
    }

    return { valid: true, recordingId };
  } catch {
    return { valid: false };
  }
}
