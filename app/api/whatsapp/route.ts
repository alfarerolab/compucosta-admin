import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const mensaje = typeof body.mensaje === "string" ? body.mensaje.trim() : "";
    // Número en formato internacional sin "+" (lo que espera la API de WhatsApp)
    const numero = typeof body.numero === "string" || typeof body.numero === "number"
      ? String(body.numero).replace(/[\s()+-]/g, "")
      : "";

    if (!mensaje || !numero) {
      return NextResponse.json({ error: "Faltan datos en la solicitud" }, { status: 400 });
    }

    // SEG-14 — Evita usar la cuenta de WhatsApp de la empresa como relé de spam
    if (!/^\d{8,15}$/.test(numero)) {
      return NextResponse.json({ error: "Número de teléfono inválido" }, { status: 400 });
    }
    if (mensaje.length > 1000) {
      return NextResponse.json({ error: "El mensaje es demasiado largo" }, { status: 400 });
    }

    const response = await fetch(
      `https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: numero,
          type: "text",
          text: { body: mensaje },
        }),
      }
    );

    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || `WhatsApp respondió ${response.status}`);

    console.log("✅ Mensaje de WhatsApp enviado");
    return NextResponse.json({ success: true, response: data });
  } catch (error: any) {
    console.error("❌ Error enviando mensaje:", error);
    return NextResponse.json({ error: "No se pudo enviar el mensaje" }, { status: 500 });
  }
}
