import { describe, expect, it } from "vitest";
import {
  assertPublicUrl,
  cleanScrapedText,
  coerceBpm,
  htmlToText,
  isProbablyUrl,
  isSpecialCue,
  MAX_TEXT_CHARS,
  normaliseImportedSetlist,
  normaliseUrl,
} from "@/lib/ai-setlist-import";

/**
 * Setlist import (v1.43.0).
 *
 * The SSRF tests matter most: the server fetches whatever URL the user pastes,
 * so without these guards the endpoint is a proxy into the private network the
 * app runs in — cloud instance metadata included.
 */

describe("isProbablyUrl", () => {
  it("recognises http and https links", () => {
    expect(isProbablyUrl("https://www.setlist.fm/setlist/foo/123")).toBe(true);
    expect(isProbablyUrl("http://example.com/setlist")).toBe(true);
    expect(isProbablyUrl("  https://setlist.fm/x  ")).toBe(true);
  });

  it("never mistakes a setlist line for a URL", () => {
    // The regression that matters: "1. Enter Sandman" must never be fetched.
    expect(isProbablyUrl("1. Enter Sandman")).toBe(false);
    expect(isProbablyUrl("BINDTEKST")).toBe(false);
    expect(isProbablyUrl("https://x.com and then some text")).toBe(false);
    expect(isProbablyUrl("setlist.fm/setlist/foo")).toBe(false);
    expect(isProbablyUrl("")).toBe(false);
  });
});

describe("normaliseUrl", () => {
  it("trims and drops the fragment", () => {
    expect(normaliseUrl("  https://a.com/x#set-2  ")).toBe("https://a.com/x");
  });
});

describe("assertPublicUrl — SSRF guard", () => {
  it("accepts ordinary public sites", () => {
    expect(assertPublicUrl("https://www.setlist.fm/setlist/a/1").hostname).toBe(
      "www.setlist.fm"
    );
  });

  it("rejects cloud metadata endpoints", () => {
    // The highest-value target: this returns live instance credentials.
    expect(() => assertPublicUrl("http://169.254.169.254/latest/meta-data/")).toThrow();
    expect(() => assertPublicUrl("http://169.254.169.254/")).toThrow();
  });

  it("rejects loopback and localhost", () => {
    expect(() => assertPublicUrl("http://127.0.0.1:3000/admin")).toThrow();
    expect(() => assertPublicUrl("http://127.1.2.3/")).toThrow();
    expect(() => assertPublicUrl("http://localhost/")).toThrow();
    expect(() => assertPublicUrl("http://app.localhost/")).toThrow();
  });

  it("rejects RFC1918 private ranges", () => {
    expect(() => assertPublicUrl("http://10.0.0.5/")).toThrow();
    expect(() => assertPublicUrl("http://172.16.4.4/")).toThrow();
    expect(() => assertPublicUrl("http://192.168.1.1/router")).toThrow();
  });

  it("rejects carrier-grade NAT and multicast ranges", () => {
    expect(() => assertPublicUrl("http://100.64.0.1/")).toThrow();
    expect(() => assertPublicUrl("http://224.0.0.1/")).toThrow();
  });

  it("rejects IPv6 loopback, link-local and unique-local", () => {
    expect(() => assertPublicUrl("http://[::1]/")).toThrow();
    expect(() => assertPublicUrl("http://[fe80::1]/")).toThrow();
    expect(() => assertPublicUrl("http://[fd00::1]/")).toThrow();
    // IPv4-mapped loopback inherits the IPv4 rule.
    expect(() => assertPublicUrl("http://[::ffff:127.0.0.1]/")).toThrow();
  });

  it("rejects internal-looking hostnames", () => {
    expect(() => assertPublicUrl("http://db.internal/")).toThrow();
    expect(() => assertPublicUrl("http://printer.local/")).toThrow();
  });

  it("rejects non-http schemes", () => {
    // file:// and gopher:// would otherwise be a way around the host check.
    expect(() => assertPublicUrl("file:///etc/passwd")).toThrow();
    expect(() => assertPublicUrl("gopher://example.com")).toThrow();
    expect(() => assertPublicUrl("ftp://example.com/x")).toThrow();
  });

  it("rejects malformed input", () => {
    expect(() => assertPublicUrl("not a url")).toThrow();
    expect(() => assertPublicUrl("")).toThrow();
  });

  it("does not false-positive on public addresses that look odd", () => {
    // 172.15 and 172.32 sit just outside the private block.
    expect(() => assertPublicUrl("http://172.15.0.1/")).not.toThrow();
    expect(() => assertPublicUrl("http://172.32.0.1/")).not.toThrow();
    expect(() => assertPublicUrl("http://11.0.0.1/")).not.toThrow();
    expect(() => assertPublicUrl("http://192.169.0.1/")).not.toThrow();
  });
});

describe("htmlToText", () => {
  it("keeps line structure from block elements", () => {
    const html = "<div>1. Alpha</div><div>2. Beta</div>";
    expect(htmlToText(html)).toBe("1. Alpha\n2. Beta");
  });

  it("treats <br> as a line break", () => {
    expect(htmlToText("Alpha<br/>Beta<br>Gamma")).toBe("Alpha\nBeta\nGamma");
  });

  it("drops scripts, styles and comments entirely", () => {
    const html = `<script>alert('x')</script><style>.a{}</style><!-- c --><p>Song</p>`;
    const out = htmlToText(html);
    expect(out).toBe("Song");
    expect(out).not.toContain("alert");
  });

  it("decodes the entities setlist pages actually use", () => {
    expect(htmlToText("<p>Fish &amp; Chips</p>")).toBe("Fish & Chips");
    expect(htmlToText("<p>a&nbsp;b</p>")).toBe("a b");
    expect(htmlToText("<p>&quot;x&quot; &amp; &#39;y&#39;</p>")).toBe('"x" & \'y\'');
  });

  it("collapses runaway whitespace but keeps paragraphs", () => {
    expect(htmlToText("<p>a</p><p></p><p></p><p>b</p>")).toBe("a\n\nb");
    expect(htmlToText("<span>a</span>   <span>b</span>")).toBe("a b");
  });

  it("returns an empty string for markup with no text", () => {
    expect(htmlToText("<div><span></span></div>")).toBe("");
  });
});

describe("cleanScrapedText", () => {
  it("throws when a page has no readable text", () => {
    // A JS-only page would otherwise send an empty prompt and burn a model call.
    expect(() => cleanScrapedText("<div><script>1</script></div>")).toThrow();
  });

  it("caps very long pages", () => {
    const long = "<p>" + "a ".repeat(MAX_TEXT_CHARS) + "</p>";
    expect(cleanScrapedText(long).length).toBeLessThanOrEqual(MAX_TEXT_CHARS);
  });
});
describe("coerceBpm", () => {
  it("accepts plausible tempos as numbers and strings", () => {
    expect(coerceBpm(103)).toBe(103);
    expect(coerceBpm("112")).toBe(112);
    expect(coerceBpm("128 bpm")).toBe(128);
    expect(coerceBpm("~90 BPM")).toBe(90);
  });

  it("rounds fractional tempos", () => {
    expect(coerceBpm(103.6)).toBe(104);
  });

  it("refuses nonsense rather than showing NaN", () => {
    expect(coerceBpm("Allegro")).toBeNull();
    expect(coerceBpm("")).toBeNull();
    expect(coerceBpm(null)).toBeNull();
    expect(coerceBpm(undefined)).toBeNull();
    expect(coerceBpm(-80)).toBeNull();
    expect(coerceBpm(0)).toBeNull();
    expect(coerceBpm(10000)).toBeNull();
    expect(coerceBpm(Number.NaN)).toBeNull();
  });
});

describe("isSpecialCue", () => {
  it("recognises the stage cues the parser emits", () => {
    expect(isSpecialCue("BINDTEKST")).toBe(true);
    expect(isSpecialCue("PAUZE")).toBe(true);
    expect(isSpecialCue("Tweede set")).toBe(true);
    expect(isSpecialCue("encore")).toBe(true);
    expect(isSpecialCue("DJ-set")).toBe(true);
  });

  it("does not mistake a real song for a cue", () => {
    expect(isSpecialCue("Enter Sandman")).toBe(false);
    expect(isSpecialCue("Set It Off")).toBe(false);
    expect(isSpecialCue("Broken Halos")).toBe(false);
  });
});

describe("normaliseImportedSetlist", () => {
  it("returns the promised shape for a well-formed model answer", () => {
    const result = normaliseImportedSetlist({
      title: "Lowlands 2026",
      items: [
        { kind: "song", title: "Alpha", key: "Am", bpm: 103, tuning: "drop D", duration: "3:45", notes: "half time", raw: "1. Alpha in Am 103" },
        { kind: "special", title: "BINDTEKST" },
      ],
    });

    expect(result.title).toBe("Lowlands 2026");
    expect(result.songs).toHaveLength(2);
    expect(result.songs[0]).toEqual({
      title: "Alpha",
      key: "Am",
      bpm: 103,
      tuning: "drop D",
      duration: "3:45",
      notes: "half time",
      kind: "song",
      raw: "1. Alpha in Am 103",
    });
    expect(result.songs[1].kind).toBe("special");
    expect(result.songs[1].bpm).toBeNull();
  });

  it("fills absent fields with null instead of undefined", () => {
    // The UI branches on these, and `undefined` reads as "unknown" differently
    // from an explicit "the source did not say".
    const [song] = normaliseImportedSetlist({ items: [{ title: "Alpha" }] }).songs;
    expect(song.key).toBeNull();
    expect(song.bpm).toBeNull();
    expect(song.tuning).toBeNull();
    expect(song.duration).toBeNull();
    expect(song.notes).toBeNull();
    expect(song.raw).toBeNull();
  });

  it("accepts 'songs' as an alias for 'items'", () => {
    expect(normaliseImportedSetlist({ songs: [{ title: "Alpha" }] }).songs).toHaveLength(1);
  });

  it("treats a bare cue title as special even without a kind", () => {
    const result = normaliseImportedSetlist({
      items: [{ title: "PAUZE" }, { title: "Alpha" }],
    });
    expect(result.songs[0].kind).toBe("special");
    expect(result.songs[1].kind).toBe("song");
  });

  it("cleans bpm even when the model dressed it up", () => {
    const result = normaliseImportedSetlist({
      items: [{ title: "Alpha", bpm: "112 bpm" }],
    });
    expect(result.songs[0].bpm).toBe(112);
  });

  it("collapses whitespace in model output", () => {
    const [song] = normaliseImportedSetlist({
      items: [{ title: "  Alpha   Beta  " }],
    }).songs;
    expect(song.title).toBe("Alpha Beta");
  });

  it("drops rows with no usable title rather than showing blanks", () => {
    const result = normaliseImportedSetlist({
      items: [{ title: "" }, { title: "   " }, null, "nope", { title: "Alpha" }],
    });
    expect(result.songs).toHaveLength(1);
    expect(result.songs[0].title).toBe("Alpha");
  });

  it("survives junk without throwing", () => {
    expect(normaliseImportedSetlist(null).songs).toEqual([]);
    expect(normaliseImportedSetlist(undefined).songs).toEqual([]);
    expect(normaliseImportedSetlist({}).songs).toEqual([]);
    expect(normaliseImportedSetlist({ items: "not-an-array" }).songs).toEqual([]);
    expect(normaliseImportedSetlist({ items: [1, true, {}] }).songs).toEqual([]);
    expect(normaliseImportedSetlist({ title: 123 }).title).toBeNull();
  });

  it("keeps order exactly as the model gave it", () => {
    const result = normaliseImportedSetlist({
      items: [{ title: "C" }, { title: "A" }, { title: "B" }],
    });
    expect(result.songs.map((s) => s.title)).toEqual(["C", "A", "B"]);
  });
});