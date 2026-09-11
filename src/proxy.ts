import { NextResponse, userAgent, type NextRequest } from "next/server";
import { robotsDirective } from "@/lib/crawlers";

export function proxy(request: NextRequest) {
  const agent = request.headers.get("user-agent");

  // This blocks identified crawlers, not clients impersonating a browser.
  const blocked =
    !agent ||
    userAgent(request).isBot ||
    /bot\b|crawler|spider|scrapy|ChatGPT-User|Claude-User|Claude-Web|Perplexity-User|GoogleOther|meta-externalagent|curl\/|wget\/|python-requests\/|python-urllib\/|httpx\/|go-http-client\/|headlesschrome/i.test(
      agent,
    );

  const response = blocked
    ? new NextResponse("Crawling is not permitted.", { status: 403 })
    : NextResponse.next();

  response.headers.set("X-Robots-Tag", robotsDirective);
  response.headers.set("Cache-Control", "private, no-store");

  return response;
}

export const config = {
  matcher: ["/:username/d/:documentSlug", "/public/:path*"],
};
