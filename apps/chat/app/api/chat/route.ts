import { convertToModelMessages, streamText, type UIMessage } from "ai";

import { model, opencode } from "@/lib/opencode";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const result = streamText({
    model: opencode(model),
    messages: convertToModelMessages(messages),
  });
  return result.toUIMessageStreamResponse();
}
