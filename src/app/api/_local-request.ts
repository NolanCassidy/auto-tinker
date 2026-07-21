const LOCAL_HOST_PATTERNS = [
  /^(localhost)(?::(\d{1,5}))?$/i,
  /^(127\.0\.0\.1)(?::(\d{1,5}))?$/,
  /^(\[::1\])(?::(\d{1,5}))?$/,
] as const;

type LocalAuthority = {
  hostname: "localhost" | "127.0.0.1" | "::1";
  port: string;
};

function parseLocalAuthority(value: string | null): LocalAuthority | null {
  if (!value || value.length > 255) return null;
  for (const pattern of LOCAL_HOST_PATTERNS) {
    const match = pattern.exec(value);
    if (!match) continue;
    const numericPort = match[2] ? Number(match[2]) : undefined;
    if (numericPort !== undefined && (numericPort < 1 || numericPort > 65_535)) return null;
    const rawHostname = match[1].toLowerCase();
    return {
      hostname: rawHostname === "[::1]" ? "::1" : rawHostname as LocalAuthority["hostname"],
      port: match[2] ?? "",
    };
  }
  return null;
}

function effectivePort(protocol: string, port: string) {
  if (port) return port;
  if (protocol === "http:") return "80";
  if (protocol === "https:") return "443";
  return "";
}

function sameLocalOrigin(candidate: URL, requestUrl: URL, host: LocalAuthority) {
  if (candidate.protocol !== "http:" && candidate.protocol !== "https:") return false;
  const candidateHost = parseLocalAuthority(candidate.host);
  if (!candidateHost || candidate.username || candidate.password) return false;
  return (
    candidate.protocol === requestUrl.protocol &&
    candidateHost.hostname === host.hostname &&
    effectivePort(candidate.protocol, candidateHost.port) === effectivePort(requestUrl.protocol, host.port)
  );
}

function forbidden(reason: string) {
  return Response.json(
    { error: "The Auto-Tinker viewer API only accepts same-origin requests from this computer." },
    {
      status: 403,
      headers: {
        "cache-control": "no-store",
        "x-auto-tinker-rejection": reason,
      },
    },
  );
}

/**
 * Enforces the local viewer's network boundary in every route handler.
 *
 * Loopback binding is the first boundary. This check is also kept in the
 * handlers so DNS rebinding, a future proxy, or an accidental bind change does
 * not turn private Markdown into a remotely readable or writable API.
 */
export function rejectNonLocalApiRequest(request: Request): Response | null {
  const host = parseLocalAuthority(request.headers.get("host"));
  if (!host) return forbidden("host");

  let requestUrl: URL;
  try {
    requestUrl = new URL(request.url);
  } catch {
    return forbidden("url");
  }
  const urlHost = parseLocalAuthority(requestUrl.host);
  if (
    !urlHost ||
    effectivePort(requestUrl.protocol, urlHost.port) !== effectivePort(requestUrl.protocol, host.port)
  ) {
    return forbidden("authority");
  }

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (!sameLocalOrigin(new URL(origin), requestUrl, host)) return forbidden("origin");
    } catch {
      return forbidden("origin");
    }
  }

  const isMutation = !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase());
  if (isMutation && !origin) {
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
      return forbidden("fetch-site");
    }

    const referer = request.headers.get("referer");
    if (referer) {
      try {
        if (!sameLocalOrigin(new URL(referer), requestUrl, host)) return forbidden("referer");
      } catch {
        return forbidden("referer");
      }
    }
  }

  return null;
}

export const localRequestTestHelpers = { parseLocalAuthority };
