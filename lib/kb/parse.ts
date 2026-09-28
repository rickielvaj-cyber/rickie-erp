import mammoth from "mammoth";
import TurndownService from "turndown";
import { matchModuleSlug, type KbModuleSlug } from "./modules";

export type ParsedSection = {
  heading: string;
  markdown: string;
  matchedSlug: KbModuleSlug | null;
};

const turndownService = new TurndownService({ headingStyle: "atx" });

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

function splitHtmlByHeadings(html: string): { heading: string; html: string }[] {
  const headingRegex = /<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi;
  const matches = [...html.matchAll(headingRegex)];

  if (matches.length === 0) {
    return [{ heading: "Konten", html }];
  }

  const sections: { heading: string; html: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const start = match.index! + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : html.length;
    sections.push({
      heading: stripTags(match[1]),
      html: html.slice(start, end),
    });
  }
  return sections;
}

/**
 * Parses a .docx buffer into sections split on H1/H2 headings, each matched
 * (best-effort) to a known KB module slug. Images are dropped rather than
 * base64-inlined — mammoth's custom image handler here never calls
 * `image.read()`, so the bytes are never even loaded, which matters given
 * the source docs run tens of MB with many embedded screenshots. The raw
 * .docx itself is kept in Supabase Storage for reference.
 */
export async function parseDocxBuffer(buffer: Buffer): Promise<ParsedSection[]> {
  const { value: html } = await mammoth.convertToHtml(
    { buffer },
    { convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: "" })) },
  );

  const withoutImages = html.replace(/<img[^>]*>/gi, "");
  const rawSections = splitHtmlByHeadings(withoutImages);

  return rawSections
    .map((section) => ({
      heading: section.heading,
      markdown: turndownService.turndown(section.html).trim(),
      matchedSlug: matchModuleSlug(section.heading),
    }))
    .filter((section) => section.markdown.length > 0);
}
