// app/api/banners/route.ts
import { BannerType } from "@prisma/client";
import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";

export async function GET() {
  try {
    const banners = await prismadb.banner.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
    return NextResponse.json(banners);
  } catch (error) {
    console.error('[BANNERS_GET]', error);
    return NextResponse.json(
      { error: 'Error fetching banners' },
      { status: 500 }
    );
  }
}
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, imageUrl, isActive, bannerType } = body;

    // Validación de tipos
    if (!title || !imageUrl || !bannerType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!Object.values(BannerType).includes(bannerType)) {
      return NextResponse.json({ error: "Invalid banner type" }, { status: 400 });
    }

    if (typeof isActive !== "boolean") {
      return NextResponse.json({ error: "isActive must be boolean" }, { status: 400 });
    }

    const banner = await prismadb.banner.create({
      data: {
        title,
        imageUrl,
        isActive,
        bannerType,
      },
    });

    return NextResponse.json(banner);
  } catch (error: any) {
    console.error("[BANNERS_POST]", error);
    return NextResponse.json(
      { error: error?.message || "Error creating banner", stack: error.stack },
      { status: 500 }
    );
  }
}