import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { mensaje, numero } = await req.json();

    if (!mensaje || !numero) {
      return NextResponse.json({ error: "Faltan datos en la solicitud" }, { status: 400 });
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
    if (!response.ok) throw new Error(data.error.message);

    console.log("✅ Mensaje enviado:", data);
    return NextResponse.json({ success: true, response: data });
  } catch (error: any) {
    console.error("❌ Error enviando mensaje:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
