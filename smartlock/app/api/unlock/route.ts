import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const totp = typeof body["totp"] === "string" ? (body["totp"] as string) : undefined;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const resp = await fetch("http://192.168.1.112/open_door", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ totp }),
      signal: controller.signal,
    }).catch((e) => {
      clearTimeout(timeout);
      throw e;
    });

    clearTimeout(timeout);

    const text = await resp.text().catch(() => "");

    if (!resp.ok) {
      return NextResponse.json(
        { ok: false, status: resp.status, message: text },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, status: resp.status, message: text });
  } catch (e: unknown) {
    if ((e as unknown as { name?: string })?.name === "AbortError") {
      return NextResponse.json({ ok: false, message: "timeout" }, { status: 504 });
    }
    return NextResponse.json({ ok: false, message: String(e) }, { status: 500 });
  }
}
