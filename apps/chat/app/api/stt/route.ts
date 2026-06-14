import { deepgram } from "@/lib/deepgram";

export async function POST(req: Request) {
  const audio = Buffer.from(await req.arrayBuffer());
  const { result, error } = await deepgram().listen.prerecorded.transcribeFile(audio, {
    model: "nova-3",
    language: "multi",
    smart_format: true,
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const text = result.results.channels[0]?.alternatives[0]?.transcript ?? "";
  return Response.json({ text });
}
