// Red Row Estate · Press & Media Pack — document builder
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, HeadingLevel, LevelFormat,
  Footer, PageNumber, TabStopType, SectionType, PageBreak,
  HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom, TextWrappingType, LineRuleType,
} = require("docx");

const G = (n) => fs.readFileSync(path.join(__dirname, "gfx", n));

// ---- brand -------------------------------------------------------------
const INK = "1F1F1F", GREEN = "16352A", BRASS = "B08D57", CREAM = "F3EEE4", OX = "7A2E2B",
      STONE = "E9E4DA", MUTE = "6B6B6B", LAV = "6E5BA8", COPPER = "A0623A";
const DISPLAY = "Cormorant Garamond SemiBold", DISPLAY_R = "Cormorant Garamond", DISPLAY_M = "Cormorant Garamond Medium",
      LABEL = "Cinzel", BODY = "Lato", LIGHT = "Lato Light";

// ---- geometry (A4, DXA) --------------------------------------------------
const PW = 11906, PH = 16838, ML = 1250, MR = 1250, MT = 1250, MB = 1150;
const TW = PW - ML - MR; // 9406 text width
const PX = Math.round(TW / 1440 * 96); // ≈627 px at 96 dpi

// ---- helpers -------------------------------------------------------------
const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NOB = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder };
const t = (text, o = {}) => new TextRun({ text, font: BODY, size: 21, color: INK, ...o });

const label = (text, o = {}) => new Paragraph({
  spacing: { before: o.before ?? 0, after: o.after ?? 120 }, alignment: o.align ?? AlignmentType.LEFT, keepNext: true,
  children: [new TextRun({ text: text.toUpperCase(), font: LABEL, size: o.size ?? 15, color: o.color ?? BRASS, characterSpacing: 60 })],
});

const sectionHead = (num, title, sub) => [
  new Paragraph({ pageBreakBefore: true, spacing: { before: 0, after: 0 }, keepNext: true,
    shading: { type: ShadingType.CLEAR, fill: GREEN, color: "auto" },
    children: [new TextRun({ text: `  SECTION ${num}`, font: LABEL, size: 15, color: BRASS, characterSpacing: 60 })] }),
  new Paragraph({ spacing: { before: 0, after: 0, line: 240, lineRule: LineRuleType.AUTO }, keepNext: true,
    shading: { type: ShadingType.CLEAR, fill: GREEN, color: "auto" },
    children: [new TextRun({ text: `  ${title}`, font: DISPLAY, size: 60, color: CREAM })] }),
  new Paragraph({ spacing: { before: 0, after: 360 }, keepNext: true,
    shading: { type: ShadingType.CLEAR, fill: GREEN, color: "auto" },
    children: [new TextRun({ text: `  ${sub}  `, font: DISPLAY_R, italics: true, size: 27, color: CREAM })] }),
];

const h2 = (text, o = {}) => new Paragraph({
  spacing: { before: o.before ?? 260, after: 80 }, keepNext: true,
  children: [new TextRun({ text, font: DISPLAY, size: o.size ?? 34, color: o.color ?? GREEN })],
});
const h3 = (text) => new Paragraph({ spacing: { before: 180, after: 40 }, keepNext: true,
  children: [new TextRun({ text, font: LABEL, size: 16, color: OX, characterSpacing: 40 })] });

const lead = (text, o = {}) => new Paragraph({
  spacing: { before: o.before ?? 60, after: o.after ?? 220, line: 300, lineRule: LineRuleType.AUTO }, alignment: o.align ?? AlignmentType.LEFT,
  children: [new TextRun({ text, font: DISPLAY_M, italics: true, size: o.size ?? 30, color: o.color ?? GREEN })],
});

const p = (text, o = {}) => new Paragraph({
  spacing: { before: 0, after: o.after ?? 140, line: 288, lineRule: LineRuleType.AUTO }, alignment: o.align ?? AlignmentType.LEFT, keepLines: o.keepLines,
  children: Array.isArray(text) ? text : [t(text, o.run)],
});
const dropP = (letter, rest) => new Paragraph({
  spacing: { before: 0, after: 140, line: 288, lineRule: LineRuleType.AUTO },
  children: [new TextRun({ text: letter, font: DISPLAY, size: 52, color: OX }), t(rest)],
});

const bullet = (text, o = {}) => new Paragraph({
  numbering: { reference: "diamond", level: 0 }, spacing: { before: 0, after: 70, line: 276, lineRule: LineRuleType.AUTO },
  children: Array.isArray(text) ? text : [t(text, o.run)],
});
const numbered = (text) => new Paragraph({
  numbering: { reference: "num", level: 0 }, spacing: { before: 0, after: 90, line: 276, lineRule: LineRuleType.AUTO },
  children: Array.isArray(text) ? text : [t(text)],
});

const rule = (color = BRASS, before = 120, after = 200) => new Paragraph({
  spacing: { before, after }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color, space: 1 } }, children: [],
});

const quote = (text, who) => [
  new Paragraph({ spacing: { before: 260, after: 60, line: 300, lineRule: LineRuleType.AUTO }, alignment: AlignmentType.CENTER,
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: BRASS, space: 14 } },
    indent: { left: 700, right: 700 },
    children: [new TextRun({ text: `“${text}”`, font: DISPLAY_R, italics: true, size: 36, color: OX })] }),
  new Paragraph({ spacing: { before: 0, after: 260 }, alignment: AlignmentType.CENTER, indent: { left: 700, right: 700 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BRASS, space: 14 } },
    children: [new TextRun({ text: who.toUpperCase(), font: LABEL, size: 14, color: MUTE, characterSpacing: 50 })] }),
];

const plate = (file, w = PX, caption) => {
  const h = Math.round(w * 1000 / 1600);
  const out = [new Paragraph({ spacing: { before: 120, after: caption ? 40 : 200 }, alignment: AlignmentType.CENTER, keepNext: !!caption,
    children: [new ImageRun({ type: "jpg", data: G(file), transformation: { width: w, height: h } })] })];
  if (caption) out.push(new Paragraph({ spacing: { before: 0, after: 220 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: caption, font: LIGHT, size: 16, color: MUTE, italics: true })] }));
  return out;
};

// two plates side by side, captions underneath
const sideBySide = (fa, ca, fb, cb) => {
  const cw = Math.floor((TW - 240) / 2), w = Math.round(cw / 1440 * 96), h = Math.round(w * 1000 / 1600);
  const cell = (f, c) => new TableCell({ width: { size: cw, type: WidthType.DXA }, borders: NOB, margins: { top: 0, bottom: 0, left: 0, right: 0 },
    children: [new Paragraph({ spacing: { after: 40 }, children: [new ImageRun({ type: "jpg", data: G(f), transformation: { width: w, height: h } })] }),
               new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: c, font: LIGHT, size: 16, color: MUTE, italics: true })] })] });
  const gap = new TableCell({ width: { size: 240, type: WidthType.DXA }, borders: NOB, children: [new Paragraph({ children: [] })] });
  return new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: [cw, 240, cw], borders: NOB, rows: [new TableRow({ cantSplit: true, children: [cell(fa, ca), gap, cell(fb, cb)] })] });
};
// plate on the left, text on the right
const imageText = (f, caption, children, frac = 0.42) => {
  const iw = Math.floor(TW * frac), w = Math.round(iw / 1440 * 96), h = Math.round(w * 1000 / 1600), tw = TW - iw - 300;
  return new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: [iw, 300, tw], borders: NOB, rows: [new TableRow({ cantSplit: true, children: [
    new TableCell({ width: { size: iw, type: WidthType.DXA }, borders: NOB, margins: { top: 0, bottom: 0, left: 0, right: 0 },
      children: [new Paragraph({ spacing: { after: 40 }, children: [new ImageRun({ type: "jpg", data: G(f), transformation: { width: w, height: h } })] }),
                 new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: caption, font: LIGHT, size: 16, color: MUTE, italics: true })] })] }),
    new TableCell({ width: { size: 300, type: WidthType.DXA }, borders: NOB, children: [new Paragraph({ children: [] })] }),
    new TableCell({ width: { size: tw, type: WidthType.DXA }, borders: NOB, margins: { top: 0, bottom: 0, left: 0, right: 0 }, children }),
  ] })] });
};

// side panel: single shaded cell with brass left rule
const panel = (title, items, o = {}) => new Table({
  width: { size: TW, type: WidthType.DXA }, columnWidths: [TW], borders: NOB,
  rows: [new TableRow({ cantSplit: true, children: [new TableCell({
    width: { size: TW, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, fill: o.fill ?? STONE, color: "auto" },
    margins: { top: 220, bottom: 200, left: 320, right: 320 },
    borders: { top: noBorder, bottom: noBorder, right: noBorder, left: { style: BorderStyle.SINGLE, size: 24, color: o.rule ?? BRASS } },
    children: [label(title, { after: 100, color: o.labelColor ?? OX }), ...items],
  })] })],
});

// two panels side by side
const twoPanels = (a, b) => new Table({
  width: { size: TW, type: WidthType.DXA }, columnWidths: [Math.floor(TW / 2) - 100, 200, TW - Math.floor(TW / 2) - 100], borders: NOB,
  rows: [new TableRow({ children: [
    new TableCell({ width: { size: Math.floor(TW / 2) - 100, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: STONE, color: "auto" },
      margins: { top: 200, bottom: 180, left: 280, right: 260 }, borders: { top: noBorder, bottom: noBorder, right: noBorder, left: { style: BorderStyle.SINGLE, size: 24, color: BRASS } }, children: a }),
    new TableCell({ width: { size: 200, type: WidthType.DXA }, borders: NOB, children: [new Paragraph({ children: [] })] }),
    new TableCell({ width: { size: TW - Math.floor(TW / 2) - 100, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: STONE, color: "auto" },
      margins: { top: 200, bottom: 180, left: 280, right: 260 }, borders: { top: noBorder, bottom: noBorder, right: noBorder, left: { style: BorderStyle.SINGLE, size: 24, color: BRASS } }, children: b }),
  ] })],
});

// fact strip: n tiles
const facts = (tiles) => {
  const n = tiles.length, cw = Math.floor(TW / n);
  const widths = tiles.map((_, i) => i === n - 1 ? TW - cw * (n - 1) : cw);
  return new Table({
    width: { size: TW, type: WidthType.DXA }, columnWidths: widths, borders: NOB,
    rows: [new TableRow({ cantSplit: true, children: tiles.map(([big, small], i) => new TableCell({
      width: { size: widths[i], type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: GREEN, color: "auto" },
      margins: { top: 240, bottom: 220, left: 120, right: 120 },
      borders: { top: noBorder, bottom: noBorder, left: i ? { style: BorderStyle.SINGLE, size: 4, color: BRASS } : noBorder, right: noBorder },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: big, font: DISPLAY, size: 52, color: BRASS })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0, line: 240, lineRule: LineRuleType.AUTO }, children: [new TextRun({ text: small.toUpperCase(), font: LABEL, size: 12, color: CREAM, characterSpacing: 30 })] }),
      ],
    })) })],
  });
};

// timeline rows
const timeline = (rows) => new Table({
  width: { size: TW, type: WidthType.DXA }, columnWidths: [1700, TW - 1700], borders: NOB,
  rows: rows.map(([year, text, note]) => new TableRow({ cantSplit: true, children: [
    new TableCell({ width: { size: 1700, type: WidthType.DXA }, borders: { top: noBorder, bottom: noBorder, left: noBorder, right: { style: BorderStyle.SINGLE, size: 8, color: BRASS } },
      margins: { top: 50, bottom: 70, left: 60, right: 200 },
      children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0 }, children: [new TextRun({ text: year, font: DISPLAY, size: 32, color: note ? MUTE : OX })] })] }),
    new TableCell({ width: { size: TW - 1700, type: WidthType.DXA }, borders: NOB, margins: { top: 80, bottom: 70, left: 240, right: 60 },
      children: [new Paragraph({ spacing: { after: 0, line: 264, lineRule: LineRuleType.AUTO }, children: [t(text), ...(note ? [new TextRun({ text: `  ${note}`, font: LIGHT, italics: true, size: 17, color: MUTE })] : [])] })] }),
  ] })),
});

// generic bordered data table
const dataTable = (widths, header, rows, o = {}) => new Table({
  width: { size: TW, type: WidthType.DXA }, columnWidths: widths, borders: NOB,
  rows: [
    new TableRow({ tableHeader: true, children: header.map((h, i) => new TableCell({
      width: { size: widths[i], type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill: GREEN, color: "auto" }, margins: { top: 110, bottom: 100, left: 140, right: 120 }, borders: NOB,
      children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: h.toUpperCase(), font: LABEL, size: 13, color: CREAM, characterSpacing: 40 })] })] })) }),
    ...rows.map((r, ri) => new TableRow({ cantSplit: true, children: r.map((c, i) => new TableCell({
      width: { size: widths[i], type: WidthType.DXA }, shading: ri % 2 ? { type: ShadingType.CLEAR, fill: "F7F4EE", color: "auto" } : undefined,
      margins: { top: 90, bottom: 90, left: 140, right: 120 },
      borders: { top: noBorder, left: noBorder, right: noBorder, bottom: { style: BorderStyle.SINGLE, size: 4, color: "D9D3C7" } },
      children: [new Paragraph({ spacing: { after: 0, line: 252, lineRule: LineRuleType.AUTO }, children: Array.isArray(c) ? c : [t(c, { size: o.size ?? 18 })] })] })) })),
  ],
});

const footer = new Footer({ children: [new Paragraph({
  tabStops: [{ type: TabStopType.RIGHT, position: TW }], spacing: { before: 0, after: 0 },
  border: { top: { style: BorderStyle.SINGLE, size: 4, color: BRASS, space: 8 } },
  children: [
    new TextRun({ text: "RED ROW ESTATE  ·  PRESS & MEDIA PACK  ·  2026", font: LABEL, size: 12, color: BRASS, characterSpacing: 40 }),
    new TextRun({ text: "\t", font: LABEL, size: 12 }),
    new TextRun({ children: ["PAGE ", PageNumber.CURRENT], font: LABEL, size: 12, color: MUTE, characterSpacing: 40 }),
  ],
})] });

const pageProps = (extra = {}) => ({ page: { size: { width: PW, height: PH }, margin: { top: MT, bottom: MB, left: ML, right: MR, footer: 560, header: 500 } }, ...extra });
const oneCol = (children, extra = {}) => ({ properties: pageProps({ type: SectionType.CONTINUOUS, ...extra }), footers: { default: footer }, children });
const twoCol = (children) => ({ properties: pageProps({ type: SectionType.CONTINUOUS, column: { count: 2, space: 520, separate: false } }), footers: { default: footer }, children });

const fullPage = (file) => new Paragraph({ spacing: { before: 0, after: 0 }, children: [new ImageRun({
  type: "jpg", data: G(file), transformation: { width: 794, height: 1123 },
  floating: { horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 }, verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
    behindDocument: true, allowOverlap: true, lockAnchor: true, wrap: { type: TextWrappingType.NONE } },
})] });

// ======================================================================
// CONTENT
// ======================================================================
const sections = [];

// ---- COVER ------------------------------------------------------------
const emptyFooter = new Footer({ children: [new Paragraph({ children: [] })] });
sections.push({ properties: { page: { size: { width: PW, height: PH }, margin: { top: 0, bottom: 0, left: 0, right: 0 } } }, footers: { default: emptyFooter }, children: [fullPage("cover.jpg")] });

// ---- OPENING SPREAD ----------------------------------------------------
sections.push(oneCol([
  label("Red Row Estate  ·  Beamish  ·  County Durham", { align: AlignmentType.CENTER, after: 200, size: 16, before: 120 }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160, line: 228, lineRule: LineRuleType.AUTO }, children: [new TextRun({ text: "One estate. One family.", font: DISPLAY, size: 66, color: GREEN }), new TextRun({ break: 1, text: "Three centuries of stories.", font: DISPLAY, size: 66, color: GREEN })] }),
  lead("A thirty-seven-acre working country estate on the side of the Beamish conservation valley, gathered around an inn that has stood on Red Row since about 1690. A place to eat, sleep, marry, drive, roast, grow, or simply pull in for the night.", { align: AlignmentType.CENTER, after: 260, size: 28 }),
  facts([["c.1690", "First cottage on Red Row"], ["37", "Acres of valley, wood and lavender"], ["12", "Oak-fitted rooms at Old Red Row"], ["349", "Seated in the Orchard Marquee"], ["1 mile", "To Beamish Museum"]]),
  h2("A note for editors, producers and picture desks", { before: 300 }),
  p("This pack is written to be lifted from. Every section stands alone, every figure is one the estate is willing to be quoted on, and every image plate marks a photograph the estate can supply at print resolution, or arrange to have taken. Where a claim rests on family memory rather than a document, we say so, and the verification notes at the back set out what is still being checked."),
  p("Red Row is unusual because it is not one story but a dozen that happen to share a postcode: a 300-year-old pub, a Sunday lunch, a wedding under canvas for 349, a DB5 on a lift, a Caterham on a Sunday morning, a motorhome parked up for free under a big sky, a lavender field in July. Pick the one that suits your readers. We will make the rest easy."),
  new Paragraph({ spacing: { before: 200, after: 80 }, children: [] }),
  twoPanels([
    label("Inside this pack", { after: 80 }),
    p([t("01  The Estate", { bold: true, size: 19 }), t("   Thirty-seven acres, one postcode", { size: 19 })], { after: 30 }),
    p([t("02  The Black Horse", { bold: true, size: 19 }), t("   Bobby Shafto's cottage, restored", { size: 19 })], { after: 30 }),
    p([t("03  Red Row through time", { bold: true, size: 19 }), t("   1690 to 2026 on one page", { size: 19 })], { after: 30 }),
    p([t("04  Stay", { bold: true, size: 19 }), t("   Rooms, Retreat, Huckleberry Cottage", { size: 19 })], { after: 30 }),
    p([t("05  Celebrate", { bold: true, size: 19 }), t("   Marquee, suite and the big field", { size: 19 })], { after: 30 }),
    p([t("06  Motoring", { bold: true, size: 19 }), t("   Aston Workshop, Car Barn, The Hill", { size: 19 })], { after: 30 }),
    p([t("07  The open road", { bold: true, size: 19 }), t("   Free motorhome stopovers", { size: 19 })], { after: 30 }),
  ], [
    label("Also inside", { after: 80 }),
    p([t("08  Land and larder", { bold: true, size: 19 }), t("   Lavender, gardens, coffee", { size: 19 })], { after: 30 }),
    p([t("09  The Fountain family", { bold: true, size: 19 }), t("   Farmer, restorer, publican, host", { size: 19 })], { after: 30 }),
    p([t("10  Story angles", { bold: true, size: 19 }), t("   Twelve pitches to commission", { size: 19 })], { after: 30 }),
    p([t("11  Facts and boilerplate", { bold: true, size: 19 }), t("   Numbers, descriptions, contacts", { size: 19 })], { after: 30 }),
    p([t("12  Image library", { bold: true, size: 19 }), t("   Plates, briefs, existing sources", { size: 19 })], { after: 30 }),
    p([t("13  Editor's notes", { bold: true, size: 19 }), t("   Verified, family account, checking", { size: 19 })], { after: 30 }),
  ]),
]));

// ---- 01 THE ESTATE ------------------------------------------------------
sections.push(oneCol([
  ...sectionHead("01", "The Estate", "Thirty-seven acres on the side of the Beamish valley"),
  imageText("p01_estate.jpg", "Plate 01 · The Beamish valley from Red Row. Hero aerial, golden hour.", [
    dropP("R", "ed Row Estate sits high on the side of the Beamish conservation valley in County Durham, a mile from Beamish Museum, the most visited attraction in the North East, and within a stroll of Causey Arch, the oldest surviving single-arch railway bridge in the world. Tanfield Railway, the oldest railway in the world still running, is the next valley over."),
    p("The estate runs to thirty-seven acres of pasture, woodland, orchards and kitchen gardens, with one of the very few lavender fields in the North East of England laid out along the valley's edge. Wildlife has the run of it. So, in the family's own phrase, do the farmyard antiques.", { after: 0 }),
  ], 0.5),
  new Paragraph({ spacing: { before: 200, after: 0 }, children: [] }),
  p("What began around 1690 as a row of quarrymen's and colliers' cottages is now home to a 300-year-old inn and restaurant, more than twenty bedrooms across three very different places to stay, two licensed wedding venues, an internationally known Aston Martin specialist, a sports and classic car showroom that is an official Caterham retailer, and free overnight stopovers for motorhomes and campervans. Everything on the estate is owned and run by one family, the Fountains, who have lived on Red Row for forty-five years."),
  twoPanels([
    label("Hospitality", { after: 80 }),
    bullet("The Black Horse Beamish: bar, restaurant, courtyard, play park"),
    bullet("Old Red Row Rooms: twelve oak-fitted bedrooms"),
    bullet("Red Row Retreat: two suites, two doubles, sleeps ten"),
    bullet("Huckleberry Cottage: a private two-bedroom cottage"),
    bullet("The Orchard Marquee and the George Ridley Suite"),
    bullet("Motorhome and campervan stopovers"),
  ], [
    label("Motoring and land", { after: 80 }),
    bullet("Aston Workshop: restoration, service, parts and sales since 1988"),
    bullet("Car Barn: sports, prestige and classic cars; Caterham retailer"),
    bullet("Car Barn Drivers' Club monthly meets and The Hill"),
    bullet("The Great North Classic Car Show field, space for 550 exhibits"),
    bullet("Lavender field, woodland, orchards and ten acres of kitchen garden"),
    bullet("Red Row Estate Coffee"),
  ]),
  new Paragraph({ spacing: { before: 160, after: 0 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "“A glorious thirty-seven-acre sprawl with lavender field and woodland, riddled with wildlife and farmyard antiques.”", font: DISPLAY_R, italics: true, size: 26, color: OX })] }),
]));

// ---- 02 THE BLACK HORSE ------------------------------------------------
sections.push(oneCol([
  ...sectionHead("02", "The Black Horse", "Bobby Shafto's cottage, twenty-eight souls, one long restoration"),
  ...plate("p02_blackhorse.jpg", PX, "Plate 02 · The Black Horse at dusk, lights in the windows, the row of cottages behind."),
]));
sections.push(twoCol([
  h3("Bobby Shafto's cottages"),
  dropP("T", "he building that is now the Black Horse was put up around 1690 as the first and largest of ten cottages on Red Row, on the Beamish estate of Bobby Shafto, MP for County Durham and the subject of the song every child in the North East can still sing. The leases came with a condition: each cottage had to provide one able-bodied man for the quarry or the pit."),
  p("A lease survives in the Shafto (Beamish) Papers at Durham University for a dwelling house at Beamish Red Row dated 1740, and it refers to an earlier lease still. The row was never grand. It was where the men who cut Beamish stone and Beamish coal came home to."),
  h3("Twenty-eight under one roof"),
  p("By the 1851 census, twenty-eight people were living at the Black Horse: colliery workers and their children, domestic servants and, the census notes, scholars. The house had become a licensed public house by about 1850, and it has been one ever since."),
  h3("The matchbox bar"),
  p("Earlier landlords brought matchboxes back from every journey they made and pinned them up around the bar. The collection grew into a tradition, and the tradition became part of the character of the room. It is the sort of detail that photographs beautifully and that regulars still talk about."),
  h3("Four years, one pub"),
  p("Bob Fountain, whose Aston Martin workshop already sat next door, bought the Black Horse in 2006. He had first drunk in it more than three decades earlier. The restoration took four years and the pub reopened in 2010 with its flagstone floors, its open fires and, in the words of CAMRA's Durham branch listing, all of its 300-year-old charm and atmosphere intact. Within a decade it had become one of the best-known gastro pubs in the region and a wedding and events venue in its own right."),
  h3("Today"),
  p("The Black Horse serves breakfast every day, dines all day Monday to Saturday, and gives Sunday over entirely to a lunch menu that changes every week. Afternoon tea comes classic, with Prosecco, as a Gentleman's version with hearty bites, or in a children's size. The bar keeps two changing cask ales, with Theakston and Timothy Taylor regulars. Dogs are welcome in the bar and the courtyard, there is a play park for children, and ten acres of the estate's own vegetable gardens and orchards stand behind the phrase field to plate."),
]));
sections.push(oneCol([
  ...plate("p03_bar.jpg", PX, "Plate 03 · Firelight and flagstones: the bar, the fire and the matchbox collection."),
  facts([["c.1690", "Built as a cottage"], ["c.1850", "Licensed as an inn"], ["28", "Residents in the 1851 census"], ["2006", "Bought by Bob Fountain"], ["2010", "Reopened after restoration"]]),
  new Paragraph({ spacing: { before: 240, after: 0 }, children: [] }),
  panel("Opening hours worth printing", [
    p([t("Breakfast", { bold: true }), t("   Every day, 8am to 10am")], { after: 40 }),
    p([t("All-day dining", { bold: true }), t("   Monday to Saturday, 12 noon to 9pm")], { after: 40 }),
    p([t("Afternoon tea", { bold: true }), t("   Monday to Saturday, 12 noon to 4pm; book by 6pm the day before")], { after: 40 }),
    p([t("Sunday lunch", { bold: true }), t("   12 noon to 6pm; a different menu every week")], { after: 40 }),
    p([t("Bar", { bold: true }), t("   Two changing cask ales; dogs welcome in the bar and courtyard")], { after: 0 }),
  ]),
]));

// ---- 03 TIMELINE --------------------------------------------------------
sections.push(oneCol([
  ...sectionHead("03", "Red Row through time", "Three centuries on one page"),
  timeline([
    ["c.1690", "Ten cottages are built on Red Row on the Beamish estate of Bobby Shafto, MP for County Durham. The first and largest becomes the Black Horse."],
    ["1725", "Causey Arch is built a short walk away: the oldest surviving single-arch railway bridge in the world."],
    ["1740", "A lease for a dwelling house at Beamish Red Row is recorded in the Shafto (Beamish) Papers, now at Durham University, referring to an earlier lease.", "Archive reference to be cited."],
    ["c.1850", "The cottage is licensed as a public house."],
    ["1851", "The census records twenty-eight people living at the Black Horse: colliery workers and their children, servants and scholars."],
    ["1926", "Vaux Breweries of Sunderland acquires the Black Horse, said within the family to be the oldest pub in the Vaux estate. Brewery visitors are said to have arrived by Vaux dray.", "Family account; being checked against Vaux records."],
    ["1970s", "A young Bob Fountain first drinks at the Black Horse. He has been a customer for fifty-five years."],
    ["c.1981", "Bob makes Red Row his home: a 300-year-old cottage, two acres and a flock of sheep."],
    ["1988", "A friend arrives up the drive in a DB5. Bob restores one in the sheep shed, sells it, and founds Aston Workshop with the proceeds."],
    ["2006", "Bob buys the Black Horse. A four-year restoration begins."],
    ["2010", "The Black Horse reopens: flagstones, open fires, eclectic furniture, matchboxes."],
    ["2025", "Car Barn Beamish, run by Bob's son Fraser, joins the Caterham Cars UK retailer network."],
    ["2026", "The Hill, a celebration of all things Aston Martin, returns to Red Row on Sunday 9 August. This press pack is issued."],
  ]),
  new Paragraph({ spacing: { before: 200, after: 0 }, children: [] }),
  imageText("p04_archive.jpg", "Plate 04 · Red Row in the archive.", [
    label("In the archive", { after: 60 }),
    p("The Shafto (Beamish) Papers at Durham University Archives and Special Collections document the Beamish estate, its families and its properties, including Red Row, from the eighteenth century. For a feature, the most powerful image is the oldest photograph of the Black Horse or the cottages placed beside the same view today.", { after: 0, run: { size: 17 } }),
  ], 0.34),
]));

// ---- 04 STAY ------------------------------------------------------------
sections.push(oneCol([
  ...sectionHead("04", "Stay", "Twenty bedrooms, three very different ways to sleep on the estate"),
  lead("Everything on Red Row is a two-minute walk from everything else. Guests can eat at the Black Horse, sleep above the valley, and be at Beamish Museum before the trams start running."),
  ...plate("p05_rooms.jpg", PX, "Plate 05 · An Old Red Row bedroom: handmade bed, oak, copper roll-top tub."),
  h2("Old Red Row Rooms"),
  p("Twelve bedrooms in the historic Red Row accommodation, six on the lower ground floor and six above, each fitted in bespoke oak and named after English horticulture. The beds are large and handmade; the bathrooms carry roll-top copper tubs, walk-in power showers and proper toiletries. The lower ground floor rooms are dog-friendly. Guests on TripAdvisor describe them as being like having your own suite, and note that the furniture looks as if it was made locally, with care. It was."),
  h2("Red Row Retreat"),
  p("Tucked into a secluded corner of the estate, looking across the Beamish Burn valley. Two self-catering suites, Rosemary and Lovage, each have a private outdoor terrace; two stylish doubles, Sage and Thyme, are en suite. Book them separately, or interconnect the lot into one home-from-home that sleeps ten, with its own living space, dining table, fully equipped kitchen, sitting area and writing desk. A new hot tub on the terrace turns it into a romantic countryside getaway. Dogs are welcome for a small nightly charge."),
  h2("Huckleberry Cottage"),
  p("A standalone two-bedroom cottage in the peaceful Beamish conservation valley, two or three minutes' stroll from the Black Horse and minutes from Beamish Museum and Tanfield Railway. For guests who want the estate around them and nobody else."),
  sideBySide("p06_retreat.jpg", "Plate 06 · The Retreat terrace over the Beamish Burn valley.", "p07_huckleberry.jpg", "Plate 07 · Huckleberry Cottage in the conservation valley."),
  new Paragraph({ spacing: { before: 160, after: 0 }, children: [] }),
  twoPanels([
    label("Who stays", { after: 80 }),
    bullet("Wedding parties and their guests"),
    bullet("Families visiting Beamish Museum"),
    bullet("Couples on a countryside weekend"),
    bullet("Aston Workshop and Car Barn customers"),
    bullet("Walkers, dog owners, motorhome travellers"),
  ], [
    label("In every room", { after: 80 }),
    bullet("Handmade beds and oak-fitted furniture"),
    bullet("Copper roll-top tubs or rainforest showers"),
    bullet("Fridge, safe, television, coffee machine"),
    bullet("Breakfast at the Black Horse from 8am"),
    bullet("The valley outside the window"),
  ]),

]));

// ---- 05 CELEBRATE -------------------------------------------------------
sections.push(oneCol([
  ...sectionHead("05", "Celebrate", "Weddings under canvas for 349, or by the fire for fifty"),
  ...plate("p08_wedding.jpg", PX, "Plate 08 · A Red Row wedding: the couple on the estate, the marquee dressed for the breakfast."),
  dropP("T", "wo very different rooms, both licensed for civil ceremonies. The Orchard Marquee seats up to 349 for a wedding breakfast and opens onto the estate, which makes it one of the largest country wedding spaces in County Durham. The George Ridley Suite, with its stone walls and fireplace, takes 54 for a ceremony, 45 for the breakfast and 80 for the evening, and suits a wedding that wants the pub at its heart."),
  p("Around them sit twenty bedrooms, a 300-year-old bar for the night before, a Sunday lunch for the morning after, and a family that has been hosting on this hillside for years. The estate is as comfortable with a short-notice winter wedding as with a summer festival celebration, and its private dining, business retreat and Christmas offers use the same rooms all year round."),
  facts([["349", "Seated in the Orchard Marquee"], ["54 · 45 · 80", "George Ridley Suite: ceremony · breakfast · evening"], ["2", "Rooms licensed for civil ceremonies"], ["20+", "Bedrooms on site"]]),
  new Paragraph({ spacing: { before: 240, after: 0 }, children: [] }),
  h2("The big field"),
  p("Beyond the marquee, the estate's open ground hosts events at a scale few country venues can match. The Great North Classic Car Show, staged with Aston Workshop, Car Barn and Beamish Morgan, has brought more than 450 classic and exotic cars to Red Row, with room for 550 exhibits, a concours d'elegance, an outdoor bar and barbecue, and catering inside the marquee. The same ground and infrastructure are available for supercar and motorcycle gatherings, food and drink festivals, corporate family days, product launches, rural shows, markets, charity events and large private celebrations."),
  ...plate("p09_marquee.jpg", PX, "Plate 09 · The Orchard Marquee and grounds on a show day: scale, people, atmosphere."),
  panel("Also on the calendar", [
    bullet("Wedding packages, including winter and short-notice dates"),
    bullet("Private dining and celebrations in the pub"),
    bullet("Corporate events and business retreats, with accommodation on site"),
    bullet("Christmas Day lunch in the pub or the marquee; festive stays over Christmas"),
    bullet("Christmas market, movie nights, bingo and live music through the year"),
  ]),
]));

// ---- 06 MOTORING --------------------------------------------------------
sections.push(oneCol([
  ...sectionHead("06", "Motoring", "The unlikely home of Aston Martin restoration in the North"),
  ...plate("p10_aston.jpg", PX, "Plate 10 · Aston Workshop: a DB on the lift, or the showroom line-up."),
]));
sections.push(twoCol([
  h3("Aston Workshop"),
  dropP("I", "n 1988 Bob Fountain gave up sheep farming. A friend had rolled up the drive at Red Row in an Aston Martin DB5; Bob converted the sheep shed into a garage, restored a DB5 of his own, sold it, and used the money to start a business. More than thirty-five years later, Aston Workshop is one of the best-known independent Aston Martin specialists in the world, and the tiny hamlet of Red Row is its home."),
  p("The site has grown around the farmhouse into two showrooms with space for eighty cars, one of the largest collections of Aston Martins for sale anywhere in the UK, together with service bays, a full restoration workshop, a trim shop, a body shop, an engine assembly room and dynamometer, spray booths, and parts manufacture and distribution for owners around the globe. Bob remains the sole proprietor."),
  p("Guided tours run on the first Friday of every month, arriving at 2pm for a 2.30pm start, and take visitors through the showroom, the workshop, the engineering facilities and the body and paint centre. Once a year, on The Hill, the whole estate opens for a celebration of all things Aston: live demonstrations, behind-the-scenes tours, an Aston Martin timeline from pre-war to present, drop-in question sessions with the workshop team, and food from the Black Horse. The 2026 edition is on Sunday 9 August; Aston Martin owners can claim a free ticket so their car has a place on the field."),
  h3("Car Barn"),
  p("Founded by Bob and run by his son Fraser, Car Barn is the North East's leading independent sports, prestige and classic car specialist. Its showroom shares the estate with Aston Workshop and the Black Horse, and in 2025 it joined the Caterham Cars UK retailer network as Caterham Car Barn Beamish, alongside names such as Caterham Silverstone and Caterham Williams. It is also an INEOS Grenadier servicing agent."),
  p("Car Barn is where the estate's motoring community gathers. The Car Barn Drivers' Club brings owners of classics, performance cars and specialist vehicles to Red Row for monthly meets, with coffee and breakfast from the pub, and the estate's field and marquee give club gatherings room to grow into full-scale shows."),
]));
sections.push(oneCol([
  ...plate("p11_carbarn.jpg", PX, "Plate 11 · Car Barn on meet day: Caterhams, classics and supercars filling the yard."),
  ...quote("Over thirty-five years ago the tiny hamlet of Red Row, Beamish, became the unlikely home of Aston Martin restoration in the North.", "Aston Workshop, on its own history"),
  facts([["1988", "Aston Workshop founded"], ["80", "Cars across two showrooms"], ["Tours", "First Friday, monthly"], ["9 Aug", "The Hill 2026"], ["2025", "Caterham retailer"]]),
]));

// ---- 07 THE OPEN ROAD ---------------------------------------------------
sections.push(oneCol([
  ...sectionHead("07", "The open road", "Free stopovers for motorhomes and campervans, all year round"),
  ...plate("p12_motorhome.jpg", Math.round(PX * 0.84), "Plate 12 · Stopover under big skies: a motorhome parked up, the valley behind, the pub a short walk away."),
  dropP("T", "he proposition could not be simpler. Arrive, park, relax, eat, explore, sleep. Red Row welcomes motorhomes and campervans to stop overnight, free, all year round, on a first-come, first-served basis. The Black Horse is a short walk away for breakfast, a pint or Sunday lunch; the courtyard and bar are dog-friendly; there is a play park for children; and Beamish Museum is a walkable mile down the road."),
  p("The stopover has found a loyal following among the motorhome clubs and the wild-camping forums, where the Black Horse is regularly named among the best pub stopovers in the country. For a travel desk it is the perfect anchor for a North East road trip: Beamish, Causey Arch, Tanfield Railway and Durham City within half an hour, and a 300-year-old pub at the end of the day."),
  twoPanels([
    label("The stopover", { after: 80 }),
    bullet("Free, all year round"),
    bullet("First come, first served; no booking"),
    bullet("Dog-friendly bar and courtyard"),
    bullet("Children's play park"),
    bullet("Questions: 01207 232569 or stay@blackhorsebeamish.co.uk"),
  ], [
    label("Within reach", { after: 80 }),
    bullet("Beamish Museum: about a mile, walkable"),
    bullet("Causey Arch: under a mile"),
    bullet("Tanfield Railway: just over a mile"),
    bullet("Durham City and Newcastle: half an hour"),
    bullet("Hadrian's Wall and the Northumberland coast: a day trip"),
  ]),
]));

// ---- 08 LAND AND LARDER -------------------------------------------------
sections.push(oneCol([
  ...sectionHead("08", "Land and larder", "Lavender, orchards, kitchen gardens and a coffee roaster"),
  ...plate("p13_lavender.jpg", Math.round(PX * 0.66), "Plate 13 · Lavender at Red Row in full bloom, the valley beyond."),
  h2("The lavender field", { before: 120 }),
  p("Lavender is not a crop the North East expects to grow, which is exactly why Red Row's field, set along the edge of the valley with panoramic views over Beamish, is one of the very few in the region. It flowers from late June and draws bees, photographers and wedding parties in roughly equal numbers. The estate is exploring what comes next: essential-oil production, lavender in the kitchen and the rooms, and a season of open days."),
  h2("Field to plate"),
  p("Ten acres of the estate are given over to vegetable gardens and orchards that supply the Black Horse kitchen, so the phrase field to plate on the menu describes a walk of a few hundred yards rather than a marketing idea. The woodland is left largely to itself and to the wildlife that lives in it."),
  h2("Red Row Estate Coffee"),
  imageText("p14_coffee.jpg", "Plate 14 · Red Row Estate Coffee.", [
    p("The newest of the estate's projects: a coffee identity that links sourcing and small-batch roasting to the hospitality on the hill. The plan is for coffee roasted at Red Row to be served at the Black Horse, in the rooms and at the Car Barn meets, and to carry the estate's name beyond the valley.", { after: 0 }),
  ], 0.34),
]));

// ---- 09 THE FOUNTAIN FAMILY ---------------------------------------------
sections.push(oneCol([
  ...sectionHead("09", "The Fountain family", "Sheep farmer, Aston restorer, publican, host"),
  ...plate("p15_family.jpg", Math.round(PX * 0.84), "Plate 15 · Bob and Fraser Fountain at the Black Horse, or on the estate."),
  dropP("B", "ob Fountain first walked into the Black Horse as a young customer fifty-five years ago. He has lived at Red Row for forty-five of them, first as a sheep farmer in a 300-year-old cottage with two acres, then as the man who turned the sheep shed into an Aston Martin workshop, and from 2006 as the owner of the pub he had been drinking in for three decades."),
  p("That sequence, farmer to restorer to publican, is the whole estate in one life. Aston Workshop paid for the cottages; the cottages became the rooms; the pub became the venue; the field became the show ground; the lavender and the coffee are what the family is planting now. His son Fraser runs Car Barn and the Drivers' Club, which is how the next generation of the story is already on the estate."),
  p("For a feature writer the Fountains offer something rare: a family-owned country estate that is still being built by the people who built it, with a founder who can walk a journalist from the bar where he drank as a young man to the lift where a DB5 is being restored, without leaving his own land."),
  panel("Interview and access", [
    bullet("Bob Fountain is available for interview at the Black Horse or on the estate, by arrangement."),
    bullet("Fraser Fountain is available on Car Barn, Caterham, the Drivers' Club and the estate's motoring events."),
    bullet("Workshop, showroom, rooms, marquee and lavender field can all be opened for photography and filming."),
    bullet("Overnight stays for travel writers can be arranged in Old Red Row Rooms or the Retreat."),
  ]),
]));

// ---- 10 STORY ANGLES ----------------------------------------------------
const angle = (title, pitch, outlets) => [
  new Paragraph({ spacing: { before: 160, after: 30 }, keepNext: true, children: [new TextRun({ text: title, font: DISPLAY, size: 27, color: GREEN })] }),
  p(pitch, { after: 30 }),
  new Paragraph({ spacing: { before: 0, after: 100 }, children: [new TextRun({ text: outlets, font: LIGHT, italics: true, size: 16, color: MUTE })] }),
];
sections.push(oneCol([
  ...sectionHead("10", "Story angles", "Twelve pitches, ready to commission"),
  lead("Each of these can be written from this pack, a phone call and a morning on the estate. Images exist or can be arranged for every one.", { after: 100 }),
]));
sections.push(twoCol([
  ...angle("The 300-year-old pub built for Bobby Shafto's miners", "Ten cottages, one able-bodied man per lease for the quarry or the pit, twenty-eight people under one roof in 1851, and a restoration that took four years.", "Regional features · heritage titles · CAMRA · BBC Look North"),
  ...angle("Fifty-five years a customer, forty-five years a neighbour, twenty a landlord", "Bob Fountain's life on Red Row, from the bar he drank in as a young man to the pub he restored.", "Weekend supplements · Living North · The Northern Echo"),
  ...angle("The oldest pub in the Vaux estate", "A Sunderland brewery, a favourite pub, and brewery guests arriving by dray. Being verified now; a strong North East brewing-history piece when it is.", "Regional heritage · beer and pub titles"),
  ...angle("The County Durham hamlet that became an Aston Martin destination", "From a DB5 in a sheep shed to eighty cars in two showrooms and owners flying in from around the world.", "Classic & Sports Car · Octane · Classic Driver · national motoring"),
  ...angle("Caterham comes north", "Car Barn Beamish joins the Caterham retailer network; a Sunday morning with the Drivers' Club.", "Motoring press · regional business · Autocar and evo"),
  ...angle("The Hill, 9 August 2026", "A free-to-owners celebration of Aston Martin on a working estate, with live demonstrations and a timeline from pre-war to today.", "Event listings · motoring calendars · regional what's-on"),
  ...angle("Britain's best pub stopover?", "Free, first come first served, dogs welcome, a 300-year-old bar and Beamish Museum on foot.", "Practical Motorhome · MMM · Camping and Caravanning · travel desks"),
  ...angle("A wedding for 349 in an orchard", "One of the largest country wedding spaces in County Durham, with twenty bedrooms and a pub attached.", "Wedding titles · Bridebook · regional lifestyle"),
  ...angle("Lavender in the North East", "One of the region's only lavender fields, in full bloom above the Beamish valley from late June.", "Country Living · gardening press · regional picture desks (July)"),
  ...angle("Field to plate, literally", "Ten acres of kitchen garden and orchard a few hundred yards from the kitchen door; a Sunday lunch that changes every week.", "Food titles · Sunday lunch round-ups · Great British Food"),
  ...angle("Beamish's other attraction", "The museum draws the crowds; a mile up the hill is where they eat, sleep and park. A perfect add-on for museum coverage.", "Family travel · days-out guides · This is Durham"),
  ...angle("A family estate still being built", "Farmer, restorer, publican, host, and now roaster: the Fountains and what they are planting next.", "Business features · Bdaily · North East Times · Insider"),
]));

// ---- 11 FACTS, FIGURES, BOILERPLATE --------------------------------------
sections.push(oneCol([
  ...sectionHead("11", "Facts, figures and boilerplate", "Numbers to quote, descriptions to lift, people to call"),
  dataTable([3000, TW - 3000], ["Item", "Detail"], [
    ["Location", "Red Row, Beamish, County Durham DH9 0RW. In the Beamish conservation valley, about a mile from Beamish Museum."],
    ["Estate", "37 acres: pasture, woodland, orchards, ten acres of kitchen garden, lavender field."],
    ["The Black Horse", "Built c.1690 as the first of ten cottages on Bobby Shafto's estate; licensed c.1850; 28 residents in the 1851 census; bought 2006; restored over four years; reopened 2010."],
    ["Bar and dining", "Breakfast daily 8 to 10am; all-day dining Mon to Sat 12 to 9pm; afternoon tea Mon to Sat 12 to 4pm; Sunday lunch 12 to 6pm; two changing cask ales."],
    ["Old Red Row Rooms", "12 bedrooms (6 lower ground, dog-friendly; 6 upper); bespoke oak; handmade beds; copper roll-top tubs."],
    ["Red Row Retreat", "Suites Rosemary and Lovage with private terraces; doubles Sage and Thyme; interconnects to sleep 10; hot tub; dog-friendly."],
    ["Huckleberry Cottage", "Standalone two-bedroom cottage, 2 to 3 minutes' walk from the pub."],
    ["Weddings", "Orchard Marquee: 349 seated. George Ridley Suite: 54 ceremony, 45 breakfast, 80 evening. Both licensed for civil ceremonies."],
    ["Outdoor events", "Great North Classic Car Show: 450+ cars shown; space for 550 exhibits; concours; outdoor bar and barbecue; marquee catering."],
    ["Aston Workshop", "Founded 1988 by Bob Fountain, sole proprietor. Two showrooms, 80-car capacity; restoration, trim, body, engine and dyno, paint, parts. Tours first Friday monthly, 2pm."],
    ["Car Barn", "Run by Fraser Fountain. Sports, prestige and classic cars; official Caterham retailer since 2025; INEOS Grenadier servicing; Drivers' Club monthly meets."],
    ["The Hill 2026", "Sunday 9 August, 10am, Red Row Estate. Free tickets for Aston Martin owners."],
    ["Stopovers", "Motorhomes and campervans: free, all year, first come first served. Dog-friendly bar and courtyard; play park."],
  ], { size: 18 }),
  new Paragraph({ pageBreakBefore: true, spacing: { before: 0, after: 0 }, children: [] }),
  h2("Boilerplate, short", { before: 0 }),
  p("Red Row Estate is a 37-acre family-owned country estate in the Beamish valley, County Durham, centred on the 300-year-old Black Horse Beamish and home to Old Red Row Rooms, Red Row Retreat, Huckleberry Cottage, the Orchard Marquee, Aston Workshop and Car Barn.", { run: { italics: true } }),
  h2("Boilerplate, long"),
  p("Red Row Estate is a historic countryside estate in the Beamish conservation valley, County Durham, a mile from Beamish Museum. Owned and run by the Fountain family, it is centred on the Black Horse Beamish, an inn built around 1690 as the first of Bobby Shafto's Red Row cottages and restored over four years to reopen in 2010. Around the pub the estate brings together twenty bedrooms across Old Red Row Rooms, Red Row Retreat and Huckleberry Cottage; two licensed wedding venues, the Orchard Marquee for up to 349 guests and the George Ridley Suite; open ground for major outdoor events including the Great North Classic Car Show; Aston Workshop, the internationally known Aston Martin specialist founded on the estate in 1988; Car Barn, an official Caterham retailer; free stopovers for motorhomes and campervans; and thirty-seven acres of woodland, orchards, kitchen gardens and one of the North East's only lavender fields.", { run: { italics: true } }),
  h2("Media contact"),
  twoPanels([
    label("Red Row Estate", { after: 80 }),
    p("Red Row, Beamish", { after: 0 }), p("County Durham DH9 0RW", { after: 0 }), p("01207 232569", { after: 0 }), p("stay@blackhorsebeamish.co.uk", { after: 0 }), p("blackhorsebeamish.co.uk", { after: 0 }),
  ], [
    label("Motoring enquiries", { after: 80 }),
    p("Aston Workshop: aston.co.uk", { after: 0 }), p("Car Barn: carbarn.co.uk", { after: 0 }), p("The Hill: aston.co.uk/thehill", { after: 0 }),
    p("Social: @blackhorsebeamish", { after: 0 }), p("Press email and direct contact: to be inserted", { after: 0, run: { color: MUTE, italics: true } }),
  ]),
  new Paragraph({ spacing: { before: 200, after: 0 }, children: [] }),
  twoPanels([
    label("People", { after: 80 }),
    p([t("Bob Fountain", { bold: true }), t("   Owner of Red Row Estate and the Black Horse Beamish; founder and sole proprietor of Aston Workshop")], { after: 50 }),
    p([t("Fraser Fountain", { bold: true }), t("   Runs Car Barn and the Car Barn Drivers' Club")], { after: 0 }),
  ], [
    label("Names and spellings", { after: 80 }),
    p("Red Row Estate · Black Horse Beamish (not 'the Black Horse Inn') · Old Red Row Rooms · Red Row Retreat · Huckleberry Cottage · the Orchard Marquee · the George Ridley Suite · Aston Workshop · Car Barn Beamish, trading as Caterham Car Barn Beamish · The Hill · Red Row Estate Coffee", { after: 0, run: { size: 18 } }),
  ]),
]));

// ---- 12 IMAGE LIBRARY ---------------------------------------------------
sections.push(oneCol([
  ...sectionHead("12", "Image library", "Fifteen plates, the shot briefs, and where pictures already exist"),
  p("Every plate in this pack marks a photograph the estate should hold at print resolution. Where an image already exists it is listed; where it does not, the brief is written for a photographer or a drone pilot. Own photography, supplied to journalists on request, is worth more than any stock image: it gives editors something they cannot get elsewhere."),
  dataTable([900, 2700, TW - 3600 - 2300, 2300], ["No.", "Subject", "Brief", "Existing source"], [
    ["01", "Beamish valley from Red Row", "Hero aerial or elevated view: estate, lavender, woodland, the pub in its landscape. Drone, golden hour, landscape.", "To commission"],
    ["02", "The Black Horse at dusk", "Exterior with lights in the windows and the cottages behind. Blue hour.", "Website home; TripAdvisor traveller photos"],
    ["03", "Firelight and flagstones", "Bar interior: fire, flagstones, eclectic furniture, matchbox collection. Low and warm.", "Website; TripAdvisor bar and lounge gallery"],
    ["04", "Red Row in the archive", "Best historic photograph, paired with today's view from the same spot.", "Family and local archives; Beamish Museum archive"],
    ["05", "An Old Red Row bedroom", "Handmade bed dressed, oak, copper tub in shot. Bright, uncluttered.", "Website old-red-row-rooms; TripAdvisor rooms gallery"],
    ["06", "The Retreat terrace", "Terrace over the valley, hot tub steaming, early evening.", "Website redrow; This is Durham listing"],
    ["07", "Huckleberry Cottage", "Exterior in the valley plus one atmospheric interior.", "Website huckleberry-cottage; This is Durham"],
    ["08", "A Red Row wedding", "Couple on the estate; marquee dressed for the breakfast.", "Wedding photographers (with permission); Bridebook; Real Weddings"],
    ["09", "The Orchard Marquee in summer", "Wide show-day or festival view: scale and atmosphere.", "Great North Classic Car Show archive; Flickr album 2019"],
    ["10", "Aston Workshop", "DB on the lift, craftsman at work, or showroom line-up.", "aston.co.uk; Classic & Sports Car feature; Living North"],
    ["11", "Car Barn on meet day", "Drivers' Club morning: Caterhams, classics, supercars, people.", "carbarn.co.uk; Caterham Cars announcement; Car Barn Facebook"],
    ["12", "Stopover under big skies", "Motorhome parked, valley behind, pub in walking distance. Golden light; dog if possible.", "Motorhome Stopover Club listing; to commission"],
    ["13", "Lavender at Red Row", "Rows in full bloom with the valley beyond; close frame of bees. Late June to July.", "Estate archive; to commission in season"],
    ["14", "Red Row Estate Coffee", "Green beans, the roaster at work, a cup on the bar.", "To commission"],
    ["15", "The Fountain family", "Bob and Fraser at the pub or on the estate. One portrait, one candid.", "To commission; Living North and Bdaily features"],
  ], { size: 16 }),
  h2("Where pictures already exist"),
  bullet([t("blackhorsebeamish.co.uk", { bold: true }), t(": galleries on the stay, rooms, Retreat, cottage, weddings, marquee, stopover and Aston tour pages.")]),
  bullet([t("TripAdvisor", { bold: true }), t(": 142 traveller photos on the hotel listing and more on the restaurant listing. Useful as a reference for what guests love to photograph, not for publication: guest photos are not licensed for press use.")]),
  bullet([t("Flickr and Instagram", { bold: true }), t(": the estate's own Flickr account (blackhorsebeamish) and @blackhorsebeamish on Instagram and TikTok; the Great North Classic Car Show 2019 Flickr album.")]),
  bullet([t("aston.co.uk and carbarn.co.uk", { bold: true }), t(": workshop, showroom and event photography; the Caterham Cars press announcement.")]),
  bullet([t("Wedding photographers", { bold: true }), t(": the strongest wedding images will be in photographers' portfolios; secure written permission and a credit line before supplying to press.")]),
  panel("Guidance for the final pack", [
    bullet("Landscapes: horizontal, high resolution, shot at golden hour or blue hour."),
    bullet("Buildings: both close architectural detail and the wider setting."),
    bullet("People: natural photographs of the family and staff; staff and guests in event shots."),
    bullet("Aston Workshop and Car Barn: genuine workshop and meet images, showing scale and not only single cars."),
    bullet("Rooms: bright and uncluttered; weddings: the countryside in frame; motorhomes: the experience, not the vehicle."),
    bullet("Supply as JPEG at 300 dpi, longest edge at least 4,000 pixels, with credit lines and permissions recorded."),
  ]),
]));

// ---- 13 EDITOR'S NOTES --------------------------------------------------
sections.push(oneCol([
  ...sectionHead("13", "Editor's notes", "What is verified, what is family account, and what is still being checked"),
  p("This pack distinguishes between three kinds of claim. Documented facts are drawn from the estate's own published material, the CAMRA listing, the Caterham Cars and Aston Workshop announcements, regional press coverage and public archives. Family account covers history passed down at Red Row and told in good faith; it is flagged as such wherever it appears. Items still being checked are listed here so that nothing is presented to a journalist as verified before it is."),
  h2("Family account, flagged in the text"),
  bullet("Vaux Breweries of Sunderland acquiring the Black Horse in 1926, and the pub being the oldest in the Vaux estate."),
  bullet("A Nicholson associated with Vaux regarding the Black Horse as a favourite and bringing International Brewery Club guests by dray."),
  bullet("The matchbox tradition's origin with earlier landlords."),
  h2("Being checked before external distribution"),
  numbered("Exact date and origin of the Black Horse building, and the relationship between the 1740 Red Row lease in the Shafto (Beamish) Papers and the present building."),
  numbered("The 1926 Vaux acquisition, the oldest-pub claim, the identity of the Nicholson referred to, and any International Brewery Club visits, against Vaux brewery records; any historic dray photographs."),
  numbered("The exact wording of the CAMRA Durham branch description, for quotation."),
  numbered("Outdoor event capacity, parking, licensing and event limits for the big field."),
  numbered("Current stopover terms: free status, maximum stay, facilities, any restrictions."),
  numbered("Accommodation counts and descriptions, including the Retreat hot tub and the total bedroom count across the three properties."),
  numbered("Press email, direct owner contact and social-media handles for the contact page."),
  numbered("The Red Row Estate Coffee and lavender essential-oil projects: current status and what can be said publicly."),
  h2("Assets still to add"),
  p("Red Row Estate master logo; Black Horse Beamish logo; Aston Workshop and Car Barn logos; the fifteen photographs listed in the image library; historic Vaux material if located. Once the logos are supplied, the cover, section openers and footer of this pack should carry the estate's own marks in place of the horseshoe device used here."),
  rule(BRASS, 300, 160),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [new TextRun({ text: "RED ROW ESTATE · PRESS & MEDIA PACK · FIRST EDITION · SEPTEMBER 2026 · WORKING DRAFT FOR THE OWNER'S REVIEW", font: LABEL, size: 12, color: MUTE, characterSpacing: 40 })] }),
]));

// ---- BACK COVER ---------------------------------------------------------
sections.push({ properties: { page: { size: { width: PW, height: PH }, margin: { top: 0, bottom: 0, left: 0, right: 0 } }, type: SectionType.NEXT_PAGE }, footers: { default: emptyFooter }, children: [fullPage("backcover.jpg")] });

sections[1].properties.type = SectionType.NEXT_PAGE;
// ======================================================================
const doc = new Document({
  creator: "Red Row Estate", title: "Red Row Estate · Press & Media Pack", description: "Press and media pack for Red Row Estate and the Black Horse Beamish",
  styles: { default: { document: { run: { font: BODY, size: 21, color: INK }, paragraph: { spacing: { line: 288, lineRule: LineRuleType.AUTO } } } } },
  numbering: { config: [
    { reference: "diamond", levels: [{ level: 0, format: LevelFormat.BULLET, text: "◆", alignment: AlignmentType.LEFT,
      style: { run: { font: BODY, size: 11, color: BRASS }, paragraph: { indent: { left: 340, hanging: 240 } } } }] },
    { reference: "num", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
      style: { run: { font: DISPLAY, size: 24, color: OX }, paragraph: { indent: { left: 420, hanging: 420 } } } }] },
  ] },
  sections,
});

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(__dirname, "out", "raw.docx");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, buf);
  console.log("wrote", out, buf.length, "bytes");
});
