/**
 * Shared HTML shell for the browser's "Save as PDF" flow.
 * Professional, modern PDF export with improved typography, spacing, and visual hierarchy.
 */
export function createPrintDocument(title: string, content: string, options?: {
  includeLogo?: boolean;
  logoUrl?: string;
  font?: string;
  pageSize?: string;
  pageBreakMode?: string;
  darkMode?: boolean;
  showHeaders?: boolean;
  showMetadata?: boolean;
  imagesOnly?: boolean;
  showPageNumbers?: boolean;
  marginSize?: string;
}) {
  const {
    includeLogo = true,
    logoUrl = "",
    font = "inter",
    pageSize = "a4",
    pageBreakMode = "auto",
    darkMode = false,
    showHeaders = true,
    showMetadata = true,
    imagesOnly = false,
    showPageNumbers = true,
    marginSize = "medium",
  } = options || {};

  // Map font names to CSS font stacks
  const fontStacks: Record<string, string> = {
    inter: '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    arial: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
    times: '"Times New Roman", Times, serif',
    georgia: 'Georgia, "Times New Roman", Times, serif',
    courier: '"Courier New", Courier, monospace',
  };

  // Map page sizes to CSS
  const pageSizes: Record<string, string> = {
    a4: "A4",
    letter: "Letter",
    legal: "Legal",
  };

  // Map margin sizes to CSS
  const margins: Record<string, string> = {
    small: "10mm 10mm 10mm 10mm",
    medium: "20mm 20mm 20mm 20mm",
    large: "30mm 30mm 30mm 30mm",
  };

  // Map page break modes
  const pageBreakCSS: Record<string, string> = {
    auto: "break-after: auto;",
    song: "break-after: always;",
    section: "break-after: always;",
    none: "break-after: avoid;",
  };

  const fontFamily = fontStacks[font] || fontStacks.inter;
  const cssPageSize = pageSizes[pageSize] || pageSizes.a4;
  const cssMargin = margins[marginSize] || margins.medium;
  const cssPageBreak = pageBreakCSS[pageBreakMode] || pageBreakCSS.auto;

  // Dark mode colors
  const darkModeColors = darkMode ? {
    bg: "#1a1a2e",
    text: "#e2e8f0",
    headerBorder: "#334155",
    title: "#f1f5f9",
    subtitle: "#94a3b8",
    sectionHeading: "#f1f5f9",
    sectionBorder: "#334155",
    metadataBg: "#1e293b",
    metadataBorder: "#334155",
    metadataText: "#cbd5e1",
    noteBg: "#1e293b",
    noteText: "#e2e8f0",
    noteBorder: "#6366f1",
    itemBorder: "#334155",
    itemTitle: "#f1f5f9",
    itemMeta: "#94a3b8",
    footerBorder: "#334155",
    footerText: "#64748b",
  } : {
    bg: "#fff",
    text: "#1a1a2e",
    headerBorder: "#e2e8f0",
    title: "#0f172a",
    subtitle: "#64748b",
    sectionHeading: "#0f172a",
    sectionBorder: "#e2e8f0",
    metadataBg: "#f8fafc",
    metadataBorder: "#e2e8f0",
    metadataText: "#475569",
    noteBg: "#fafbfc",
    noteText: "#334155",
    noteBorder: "#6366f1",
    itemBorder: "#e2e8f0",
    itemTitle: "#0f172a",
    itemMeta: "#64748b",
    footerBorder: "#e2e8f0",
    footerText: "#94a3b8",
  };

  // If images only mode, strip out text content
  let processedContent = content;
  if (imagesOnly) {
    processedContent = content.replace(/<[^>]+class="[^"]*section-heading[^"]*"[^>]*>.*?<\/h2>/gi, "")
      .replace(/<[^>]+class="[^"]*metadata[^"]*"[^>]*>.*?<\/div>/gi, "")
      .replace(/<[^>]+class="[^"]*note-content[^"]*"[^>]*>.*?<\/div>/gi, "")
      .replace(/<[^>]+class="[^"]*setlist-item-title[^"]*"[^>]*>.*?<\/h3>/gi, "")
      .replace(/<[^>]+class="[^"]*setlist-item-meta[^"]*"[^>]*>.*?<\/p>/gi, "")
      .replace(/<[^>]+class="[^"]*attachment-caption[^"]*"[^>]*>.*?<\/p>/gi, "");
  }

  return `<!doctype html>
<html lang="nl">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title}</title>
    <style>
      @page { size: ${cssPageSize}; margin: ${cssMargin}; }
      :root { color-scheme: ${darkMode ? 'dark' : 'light'}; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: ${darkModeColors.bg}; color: ${darkModeColors.text}; font-family: ${fontFamily}; }
      body { font-size: 11pt; line-height: 1.6; }
      .print-document { max-width: 170mm; margin: 0 auto; }
      
      /* Header */
      .document-header { text-align: center; border-bottom: 2px solid ${darkModeColors.headerBorder}; padding: 5mm 0 8mm; margin-bottom: 10mm; }
      .band-logo { margin-bottom: 4mm; display: ${includeLogo && logoUrl ? 'block' : 'none'}; }
      .band-logo img { max-height: 25mm; max-width: 80mm; object-fit: contain; }
      .document-eyebrow { color: ${darkModeColors.subtitle}; font-size: 8pt; font-weight: 600; letter-spacing: 0.15em; margin-bottom: 3mm; text-transform: uppercase; }
      .document-title { color: ${darkModeColors.title}; font-size: 28pt; font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; margin: 0; overflow-wrap: anywhere; }
      .document-subtitle { color: ${darkModeColors.subtitle}; font-size: 11pt; margin: 4mm 0 0; font-weight: 500; }
      
      /* Sections */
      .section { margin: 0 0 10mm; break-inside: avoid; page-break-inside: avoid; ${cssPageBreak} }
      .section-heading { align-items: center; color: ${darkModeColors.sectionHeading}; display: ${showHeaders ? 'flex' : 'none'}; font-size: 12pt; font-weight: 700; gap: 3mm; letter-spacing: 0.01em; margin: 0 0 5mm; text-transform: uppercase; border-bottom: 1px solid ${darkModeColors.sectionBorder}; padding-bottom: 2mm; }
      .section-heading::before { background: linear-gradient(135deg, #3b82f6, #8b5cf6); border-radius: 2px; content: ""; display: block; height: 5mm; width: 1.5mm; }
      
      /* Metadata badges */
      .metadata { display: ${showMetadata ? 'flex' : 'none'}; flex-wrap: wrap; gap: 2.5mm; justify-content: center; margin-top: 4mm; }
      .metadata-item { border: 1px solid ${darkModeColors.metadataBorder} !important; border-radius: 99px; font-size: 9pt; font-weight: 600; padding: 2mm 4mm; box-shadow: 0 1px 2px rgba(0,0,0,0.05); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      
      /* Notes */
      .note-content { background: linear-gradient(135deg, ${darkModeColors.noteBg}, ${darkModeColors.noteBg}); border-left: 4px solid ${darkModeColors.noteBorder}; color: ${darkModeColors.noteText}; padding: 5mm 6mm; white-space: pre-wrap; border-radius: 0 4px 4px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
      .note-content + .note-content { margin-top: 3mm; border-top: 1px solid ${darkModeColors.sectionBorder}; border-left: 4px solid #8b5cf6; }
      
      /* Attachments/Images */
      .attachment { break-inside: avoid; margin: 0 0 10mm; page-break-inside: avoid; text-align: center; }
      .attachment img { display: block; height: auto; margin: 0 auto; max-height: 220mm; max-width: 100%; object-fit: contain; opacity: 1; border-radius: 4px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
      .attachment img[loading] { opacity: 1; }
      .attachment img[error] { opacity: 0.3; border: 2px dashed #cbd5e1; border-radius: 4px; }
      .attachment-caption { color: ${darkModeColors.subtitle}; font-size: 9pt; font-style: italic; margin: 3mm auto 0; max-width: 150mm; line-height: 1.4; }
      
      /* Setlist specific styles */
      .setlist-item { margin-bottom: 6mm; padding-bottom: 6mm; border-bottom: 1px solid ${darkModeColors.itemBorder}; break-inside: avoid; page-break-inside: avoid; }
      .setlist-item:last-child { border-bottom: none; }
      .setlist-item-title { font-size: 12pt; font-weight: 700; color: ${darkModeColors.itemTitle}; margin: 0 0 2mm 0; }
      .setlist-item-number { color: #6366f1; font-weight: 800; margin-right: 2mm; }
      .setlist-item-meta { font-size: 9pt; color: ${darkModeColors.itemMeta}; margin: 0; font-style: italic; }
      
      /* Footer */
      .document-footer { border-top: 2px solid ${darkModeColors.footerBorder}; color: ${darkModeColors.footerText}; font-size: 8pt; margin-top: 12mm; padding-top: 4mm; text-align: center; font-weight: 500; display: ${showPageNumbers ? 'block' : 'none'}; }
      
      @media print {
        .print-document { max-width: none; }
        body, .print-document { background: #fff !important; color: #000 !important; }
        .document-footer { position: fixed; bottom: 0; left: 0; right: 0; }
        .section { break-after: ${pageBreakMode === 'auto' ? 'auto' : pageBreakMode === 'none' ? 'avoid' : 'always'}; }
        @page { margin: ${cssMargin}; }
        body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
        /* Stage-ready high-contrast output: strip ambient/dark backgrounds,
           shadows and gradients so chords & lyrics stay readable on paper. */
        .note-content { background: none !important; border-left: none !important; box-shadow: none !important; }
        .metadata-item, .band-logo, .attachment img, .document-header { box-shadow: none !important; background: none !important; }
        .section-heading::before { background: #000 !important; }
        .setlist-item { border-top: 1px solid #000 !important; border-bottom: 1px solid #000 !important; }
        .attachment img { opacity: 1 !important; }
      }
    </style>
    <script>
      function printWhenReady() {
        const images = Array.from(document.images);
        let completed = 0;
        const total = images.length;
        const finish = function() {
          completed += 1;
          const progress = completed / total;
          if (total > 0) {
            document.title = 'Loading images... ' + Math.round(progress * 100) + '%';
          }
          if (completed >= total) {
            document.title = document.title.replace(/Loading images\.\.\. \d+%/, 'Ready to print');
            window.focus();
            window.print();
          }
        };
        if (!images.length) {
          window.focus();
          window.print();
          return;
        }
        images.forEach(function(image) {
          image.addEventListener('error', function() {
            image.style.opacity = '0.3';
            image.style.border = '2px dashed #ccc';
            image.style.borderRadius = '4px';
            finish();
          }, { once: true });
          if (image.complete) {
            finish();
          } else {
            image.addEventListener('load', finish, { once: true });
          }
        });
        window.setTimeout(function() {
          if (completed < total) {
            console.warn('Print timeout: ' + completed + '/' + total + ' images loaded');
            document.title = document.title.replace(/Loading images\.\.\. \d+%/, 'Partial load - printing');
            window.focus();
            window.print();
          }
        }, 10000);
      }
      window.addEventListener('load', function() { window.setTimeout(printWhenReady, 150); });
    </script>
  </head>
  <body><main class="print-document">
    <header class="document-header">
      ${includeLogo && logoUrl ? `<div class="band-logo"><img src="${logoUrl}" alt="Band Logo" /></div>` : ''}
      <div class="document-eyebrow">Setlist</div>
      <h1 class="document-title">${title}</h1>
    </header>
    ${processedContent}
    ${showPageNumbers ? '<footer class="document-footer">GigsManager</footer>' : ''}
  </main></body>
</html>`;
}
