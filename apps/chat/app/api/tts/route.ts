import { deepgram } from "@/lib/deepgram";

export async function POST(req: Request) {
  const { text }: { text: string } = await req.json();
  const response = await deepgram().speak.request(
    { text },
    { model: "aura-2-thalia-en", encoding: "mp3" },
  );
  const stream = await response.getStream();
  if (!stream) return new Response("tts failed", { status: 500 });
  return new Response(stream, { headers: { "content-type": "audio/mpeg" } });
}
