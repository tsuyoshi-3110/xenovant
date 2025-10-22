import { NextRequest, NextResponse } from "next/server";
import { stripeConnect } from "@/lib/stripe-connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { accountId: "acct_..." }
 * Stripe Connect アカウントを削除（テストモードでも有効）
 */
export async function POST(req: NextRequest) {
  try {
    const { accountId } = await req.json();
    if (!accountId)
      return NextResponse.json({ error: "accountId required" }, { status: 400 });

    const deleted = await stripeConnect.accounts.del(accountId);

    return NextResponse.json({
      deleted,
      ok: true,
      message: `Deleted account ${accountId}`,
    });
  } catch (e: any) {
    console.error("delete-account error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
