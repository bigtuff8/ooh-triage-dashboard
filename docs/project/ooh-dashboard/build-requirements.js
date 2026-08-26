const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, LevelFormat,
  TabStopType, TabStopPosition
} = require('docx');
const fs = require('fs');

// ─── Colour palette ───────────────────────────────────────────────────────────
const BRAND_BLUE   = "1B3A6B";   // Airedale dark blue
const ACCENT_BLUE  = "2E75B6";   // Section heading blue
const LIGHT_BLUE   = "D5E8F0";   // Table header fill
const MID_BLUE     = "BDD7EE";   // Alternating row
const AMBER        = "FFC000";   // Warning colour
const RED          = "C00000";   // Critical / security alert
const WHITE        = "FFFFFF";
const LIGHT_GREY   = "F2F2F2";
const MID_GREY     = "CCCCCC";

// ─── Shared border ────────────────────────────────────────────────────────────
const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: MID_GREY };
const borders    = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

// ─── Helper: section heading underline ────────────────────────────────────────
function sectionSep() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: ACCENT_BLUE, space: 2 } },
    spacing: { after: 0 },
    children: []
  });
}

// ─── Helper: bold label + value run ───────────────────────────────────────────
function labelValue(label, value) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    children: [
      new TextRun({ text: label + ": ", bold: true, font: "Arial", size: 20 }),
      new TextRun({ text: value,         font: "Arial", size: 20 }),
    ]
  });
}

// ─── Helper: plain body paragraph ─────────────────────────────────────────────
function body(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    ...opts,
    children: [new TextRun({ text, font: "Arial", size: 20, ...opts.run })]
  });
}

// ─── Helper: simple bullet ────────────────────────────────────────────────────
function bullet(text, reference = "bullets", level = 0) {
  return new Paragraph({
    numbering: { reference, level },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, font: "Arial", size: 20 })]
  });
}

// ─── Helper: two-column table row ─────────────────────────────────────────────
function twoColRow(left, right, shade = WHITE, bold = false) {
  return new TableRow({
    children: [
      new TableCell({
        borders,
        width: { size: 3600, type: WidthType.DXA },
        shading: { fill: shade, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: left, bold, font: "Arial", size: 20 })] })]
      }),
      new TableCell({
        borders,
        width: { size: 5760, type: WidthType.DXA },
        shading: { fill: shade, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: right, bold, font: "Arial", size: 20 })] })]
      }),
    ]
  });
}

// ─── Helper: three-column table row ───────────────────────────────────────────
function threeColRow(a, b, c, shade = WHITE, bold = false) {
  const w = [2400, 3600, 3360];
  return new TableRow({
    children: [a, b, c].map((txt, i) =>
      new TableCell({
        borders,
        width: { size: w[i], type: WidthType.DXA },
        shading: { fill: shade, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: txt, bold, font: "Arial", size: 20 })] })]
      })
    )
  });
}

// ─── Helper: four-column table row ────────────────────────────────────────────
function fourColRow(a, b, c, d, shade = WHITE, bold = false) {
  const w = [2640, 2160, 2160, 2400];
  return new TableRow({
    children: [a, b, c, d].map((txt, i) =>
      new TableCell({
        borders,
        width: { size: w[i], type: WidthType.DXA },
        shading: { fill: shade, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: txt, bold, font: "Arial", size: 20 })] })]
      })
    )
  });
}

// ─── Helper: security alert paragraph ─────────────────────────────────────────
function alertPara(text) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    shading: { fill: "FFEEEE", type: ShadingType.CLEAR },
    border: {
      left:   { style: BorderStyle.SINGLE, size: 12, color: RED, space: 5 },
    },
    indent: { left: 240 },
    children: [new TextRun({ text, font: "Arial", size: 20, color: RED })]
  });
}

// ─── Helper: info-box paragraph ───────────────────────────────────────────────
function infoPara(text) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: ACCENT_BLUE, space: 5 } },
    indent: { left: 240 },
    children: [new TextRun({ text, font: "Arial", size: 20, color: BRAND_BLUE })]
  });
}

// ─── Header & Footer ──────────────────────────────────────────────────────────
const pageHeader = new Header({
  children: [
    new Paragraph({
      children: [
        new TextRun({ text: "Airedale Group – IOT / Lighthouse", font: "Arial", size: 18, color: "888888" }),
        new TextRun({ text: "\t", font: "Arial", size: 18 }),
        new TextRun({ text: "OOH Dashboard – Requirements & Research Report", font: "Arial", size: 18, color: "888888" }),
      ],
      tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: MID_GREY, space: 2 } },
    })
  ]
});

const pageFooter = new Footer({
  children: [
    new Paragraph({
      children: [
        new TextRun({ text: "CONFIDENTIAL – Internal Use Only", font: "Arial", size: 16, color: "888888" }),
        new TextRun({ text: "\t", font: "Arial", size: 16 }),
        new TextRun({ text: "Page ", font: "Arial", size: 16, color: "888888" }),
        new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: "888888" }),
      ],
      tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: MID_GREY, space: 2 } },
    })
  ]
});

// ─────────────────────────────────────────────────────────────────────────────
//  DOCUMENT
// ─────────────────────────────────────────────────────────────────────────────
const doc = new Document({
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } }
        }]
      },
      {
        reference: "sub-bullets",
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: "\u25E6", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1080, hanging: 360 } } }
        }]
      },
      {
        reference: "numbers",
        levels: [{
          level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } }
        }]
      },
    ]
  },
  styles: {
    default: { document: { run: { font: "Arial", size: 20 } } },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: BRAND_BLUE },
        paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0 }
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: ACCENT_BLUE },
        paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 }
      },
      {
        id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 22, bold: true, font: "Arial", color: BRAND_BLUE },
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 }
      },
    ]
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, right: 1260, bottom: 1440, left: 1260 }
        }
      },
      headers: { default: pageHeader },
      footers: { default: pageFooter },
      children: [

        // ══════════════════════════════════════════════════════════════════════
        //  TITLE PAGE
        // ══════════════════════════════════════════════════════════════════════
        new Paragraph({ spacing: { before: 1200, after: 0 }, children: [] }),

        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 160 },
          children: [new TextRun({ text: "OOH Dashboard", font: "Arial", size: 64, bold: true, color: BRAND_BLUE })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 80 },
          children: [new TextRun({ text: "Zendesk Frontend – Requirements & Research Report", font: "Arial", size: 32, color: ACCENT_BLUE })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: ACCENT_BLUE, space: 4 } },
          spacing: { before: 0, after: 200 },
          children: []
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 80 },
          children: [new TextRun({ text: "Airedale Group · Digital Delivery", font: "Arial", size: 22, color: "555555" })]
        }),

        new Paragraph({ spacing: { before: 80, after: 80 }, alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Version 0.1  |  17 March 2026  |  Confidential", font: "Arial", size: 18, color: "888888" })
          ]
        }),

        new Paragraph({ spacing: { before: 400, after: 80 }, alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Research Source", font: "Arial", size: 20, bold: true, color: BRAND_BLUE })]
        }),
        new Paragraph({ spacing: { before: 0, after: 40 }, alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "WhatsApp – OOH Lighthouse Support Team chat", font: "Arial", size: 20, color: "444444" })]
        }),
        new Paragraph({ spacing: { before: 0, after: 40 }, alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Chat period: 5 January 2026 – 17 March 2026  (72 days)", font: "Arial", size: 20, color: "444444" })]
        }),
        new Paragraph({ spacing: { before: 0, after: 40 }, alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "384 messages analysed", font: "Arial", size: 20, color: "444444" })]
        }),

        new Paragraph({ children: [new PageBreak()] }),

        // ══════════════════════════════════════════════════════════════════════
        //  SECURITY NOTICE
        // ══════════════════════════════════════════════════════════════════════
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "1  Security Notice", font: "Arial", size: 36, bold: true, color: RED })] }),
        sectionSep(),
        new Paragraph({ spacing: { before: 120, after: 80 },
          children: [new TextRun({ text: "During analysis of the source chat, the following sensitive credentials were identified shared in plain text. These must be treated as compromised and rotated immediately.", font: "Arial", size: 20 })]
        }),
        new Paragraph({ spacing: { before: 120, after: 0 }, children: [new TextRun({ text: "Credentials found in the WhatsApp chat (09 February 2026):", font: "Arial", size: 20, bold: true, color: RED })] }),
        alertPara("Lighthouse/Tuya login: gk-6733@lhlive.co.uk / GKLighthouse1234!"),
        alertPara("IoT WiFi password: t7ZVTqcVHD,F;:;  (variant: t7ZVTqcVHD,F;:)"),
        new Paragraph({ spacing: { before: 120, after: 80 },
          children: [new TextRun({ text: "Recommended immediate actions:", font: "Arial", size: 20, bold: true })]
        }),
        bullet("Rotate the Lighthouse / Tuya GK account password immediately."),
        bullet("Rotate the IoT WiFi password across all affected sites."),
        bullet("Establish a policy that credentials must never be shared in WhatsApp or Teams. Use a password manager or a secrets vault (e.g. Azure Key Vault) and share a reference link only."),
        bullet("The OOH Dashboard (see requirements below) should include a secure credential look-up mechanism so this practice becomes unnecessary."),

        new Paragraph({ children: [new PageBreak()] }),

        // ══════════════════════════════════════════════════════════════════════
        //  EXECUTIVE SUMMARY
        // ══════════════════════════════════════════════════════════════════════
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "2  Executive Summary", font: "Arial", size: 36, bold: true, color: BRAND_BLUE })] }),
        sectionSep(),
        body("The OOH (Out of Hours) team acts as the first point of contact for Greene King pub and hotel sites when issues arise with the Lighthouse IoT system outside of normal business hours. They relay calls via a WhatsApp group to the IoT support team who investigate remotely and either resolve, advise a manual override, or dispatch a contractor."),
        body("Analysis of 72 days of WhatsApp conversation (January–March 2026) reveals a high-frequency, high-volume support workflow that is currently entirely unstructured. There are no ticket numbers, no audit trail, no consistent escalation format, and the OOH team have limited visibility of what the Lighthouse system actually controls at each site. This creates risk, delays, and stress for all parties."),
        body("This document defines the requirements for a purpose-built OOH Dashboard within Zendesk that will replace the ad hoc WhatsApp workflow with a structured, traceable, tool-supported interface."),

        new Paragraph({ children: [new PageBreak()] }),

        // ══════════════════════════════════════════════════════════════════════
        //  PEOPLE & ROLES
        // ══════════════════════════════════════════════════════════════════════
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "3  People and Roles", font: "Arial", size: 36, bold: true, color: BRAND_BLUE })] }),
        sectionSep(),
        body("The following roles were identified from the source chat and are the primary users of the OOH Dashboard."),

        new Paragraph({ spacing: { before: 160, after: 0 }, children: [] }),

        new Table({
          width: { size: 9386, type: WidthType.DXA },
          columnWidths: [2640, 2640, 4106],
          rows: [
            threeColRow("Role", "People (observed)", "Description", LIGHT_BLUE, true),
            threeColRow("OOH Call Handler", "Kellie, Becky White, Ju, Kelly", "Receives inbound site calls OOH. Posts issue to the chat, relays responses back to site. Primary user of the OOH Dashboard."),
            threeColRow("IoT Support (Remote)", "Sam Day, Csaba Jakab (CJ), Tony Willetts", "Investigates and resolves issues remotely. Checks device status, adjusts setpoints/schedules, resets devices, dispatches engineers."),
            threeColRow("IoT / Install Management", "Jonathon Wilkinson, Ashley Sheridan, Browny (James)", "Senior oversight, escalation decisions, contractor co-ordination, BDM approval delegation."),
            threeColRow("External Contractors", "Bellrock, DPP, Nadach, GK Electrical", "On-site repair and installation. Occasionally need remote support from IoT team during callout."),
          ]
        }),

        new Paragraph({ children: [new PageBreak()] }),

        // ══════════════════════════════════════════════════════════════════════
        //  CURRENT WORKFLOW
        // ══════════════════════════════════════════════════════════════════════
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "4  Current Workflow (As-Is)", font: "Arial", size: 36, bold: true, color: BRAND_BLUE })] }),
        sectionSep(),
        body("The current OOH support workflow relies entirely on the WhatsApp group chat. The typical flow is:"),
        new Paragraph({ spacing: { before: 120, after: 0 }, children: [] }),
        bullet("Site calls the OOH telephone number.", "numbers"),
        bullet("OOH handler posts to WhatsApp: site name, number, issue, and contact phone number.", "numbers"),
        bullet("IoT support team member picks up the message (often while travelling or off-site) and investigates via the Lighthouse portal or Tuya app.", "numbers"),
        bullet("IoT team posts the outcome or action taken.", "numbers"),
        bullet("OOH handler calls site back with the resolution or next steps.", "numbers"),
        body("Variations include: IoT team calling the site directly; contractor on site requesting IoT team assistance; IoT team posting a proactive heads-up about expected volume (e.g. power pause re-engagement days)."),
        new Paragraph({ spacing: { before: 120, after: 80 }, children: [new TextRun({ text: "Key weaknesses of the current approach:", font: "Arial", size: 20, bold: true })] }),
        bullet("No ticket numbers or traceability – issues can be lost or forgotten."),
        bullet("No standard format – critical information (site number, contact number) is sometimes omitted."),
        bullet("No visibility of issue status – OOH handler has no way to know if an issue is being looked at."),
        bullet("No handover mechanism – if the IoT team member goes offline, the issue is stranded."),
        bullet("No 'scope guide' – OOH team frequently unsure whether an issue is Lighthouse-related."),
        bullet("Credentials shared in plain text (see Section 1)."),
        bullet("New site types or expansions not reliably communicated to OOH team."),
        bullet("No contractor contact directory within the tool – numbers posted ad hoc."),
        bullet("BDM approval threshold for setpoint changes is not consistently understood by OOH handlers."),

        new Paragraph({ children: [new PageBreak()] }),

        // ══════════════════════════════════════════════════════════════════════
        //  ISSUE TAXONOMY
        // ══════════════════════════════════════════════════════════════════════
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "5  Issue Taxonomy", font: "Arial", size: 36, bold: true, color: BRAND_BLUE })] }),
        sectionSep(),
        body("The following categories of issue were identified from the chat history. Approximate frequency is based on distinct incidents in the 72-day window."),

        new Paragraph({ spacing: { before: 160, after: 0 }, children: [] }),

        new Table({
          width: { size: 9386, type: WidthType.DXA },
          columnWidths: [2400, 1440, 3240, 2306],
          rows: [
            new TableRow({ children: [
              new TableCell({ borders, width: { size: 2400, type: WidthType.DXA }, shading: { fill: LIGHT_BLUE, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Category", bold: true, font: "Arial", size: 20 })] })] }),
              new TableCell({ borders, width: { size: 1440, type: WidthType.DXA }, shading: { fill: LIGHT_BLUE, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Frequency", bold: true, font: "Arial", size: 20 })] })] }),
              new TableCell({ borders, width: { size: 3240, type: WidthType.DXA }, shading: { fill: LIGHT_BLUE, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Common Presentations", bold: true, font: "Arial", size: 20 })] })] }),
              new TableCell({ borders, width: { size: 2306, type: WidthType.DXA }, shading: { fill: LIGHT_BLUE, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Typical Resolution", bold: true, font: "Arial", size: 20 })] })] }),
            ]}),

            new TableRow({ children: [
              new TableCell({ borders, width: { size: 2400, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Heating – too cold", font: "Arial", size: 20 })] })] }),
              new TableCell({ borders, width: { size: 1440, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Very High (~30%)", font: "Arial", size: 20 })] })] }),
              new TableCell({ borders, width: { size: 3240, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Site too cold, customers in coats, accommodation chilly. Ask to turn up setpoint or override.", font: "Arial", size: 20 })] })] }),
              new TableCell({ borders, width: { size: 2306, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Remote setpoint increase / override. Check current temp reading first.", font: "Arial", size: 20 })] })] }),
            ]}),
            new TableRow({ children: [
              new TableCell({ borders, width: { size: 2400, type: WidthType.DXA }, shading: { fill: LIGHT_GREY, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Heating – too hot", font: "Arial", size: 20 })] })] }),
              new TableCell({ borders, width: { size: 1440, type: WidthType.DXA }, shading: { fill: LIGHT_GREY, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Medium (~10%)", font: "Arial", size: 20 })] })] }),
              new TableCell({ borders, width: { size: 3240, type: WidthType.DXA }, shading: { fill: LIGHT_GREY, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Pub or accommodation overheating. Gateway down causing boiler fallback (full-on). Setpoint too high.", font: "Arial", size: 20 })] })] }),
              new TableCell({ borders, width: { size: 2306, type: WidthType.DXA }, shading: { fill: LIGHT_GREY, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Reduce setpoint / fix gateway. BDM approval may be required for permanent changes.", font: "Arial", size: 20 })] })] }),
            ]}),
            new TableRow({ children: [
              new TableCell({ borders, width: { size: 2400, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Heating – not responding", font: "Arial", size: 20 })] })] }),
              new TableCell({ borders, width: { size: 1440, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Medium (~10%)", font: "Arial", size: 20 })] })] }),
              new TableCell({ borders, width: { size: 3240, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "No heating despite override. Dragino gateway offline. Device offline. Controller physically broken.", font: "Arial", size: 20 })] })] }),
              new TableCell({ borders, width: { size: 2306, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Reconnect gateway / device. If controller broken, log replacement job.", font: "Arial", size: 20 })] })] }),
            ]}),
            new TableRow({ children: [
              new TableCell({ borders, width: { size: 2400, type: WidthType.DXA }, shading: { fill: LIGHT_GREY, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Lighting – external", font: "Arial", size: 20 })] })] }),
              new TableCell({ borders, width: { size: 1440, type: WidthType.DXA }, shading: { fill: LIGHT_GREY, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "High (~20%)", font: "Arial", size: 20 })] })] }),
              new TableCell({ borders, width: { size: 3240, type: WidthType.DXA }, shading: { fill: LIGHT_GREY, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Car park or external festoon lights not on. Tongou/power pause device offline or removed. Fuse tripped.", font: "Arial", size: 20 })] })] }),
              new TableCell({ borders, width: { size: 2306, type: WidthType.DXA }, shading: { fill: LIGHT_GREY, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Re-add device or apply override. If fuse tripped or no power, advise electrician.", font: "Arial", size: 20 })] })] }),
            ]}),
            new TableRow({ children: [
              new TableCell({ borders, width: { size: 2400, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Hot water – none / insufficient", font: "Arial", size: 20 })] })] }),
              new TableCell({ borders, width: { size: 1440, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Medium (~10%)", font: "Arial", size: 20 })] })] }),
              new TableCell({ borders, width: { size: 3240, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "No hot water for kitchen/accommodation. Sometimes boiler PCB issue. Sometimes our schedule.", font: "Arial", size: 20 })] })] }),
              new TableCell({ borders, width: { size: 2306, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Switch DHW override on. If boiler fault, advise contractor.", font: "Arial", size: 20 })] })] }),
            ]}),
            new TableRow({ children: [
              new TableCell({ borders, width: { size: 2400, type: WidthType.DXA }, shading: { fill: LIGHT_GREY, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Kitchen equipment off early / not on", font: "Arial", size: 20 })] })] }),
              new TableCell({ borders, width: { size: 1440, type: WidthType.DXA }, shading: { fill: LIGHT_GREY, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "High (~15%)", font: "Arial", size: 20 })] })] }),
              new TableCell({ borders, width: { size: 3240, type: WidthType.DXA }, shading: { fill: LIGHT_GREY, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Fryers, grills, extractors, glasswashers not coming on or cut off early. Power pause/contactor issue. Schedule wrong.", font: "Arial", size: 20 })] })] }),
              new TableCell({ borders, width: { size: 2306, type: WidthType.DXA }, shading: { fill: LIGHT_GREY, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Apply override or correct schedule. If contactor/firmware, engineer needed.", font: "Arial", size: 20 })] })] }),
            ]}),
            new TableRow({ children: [
              new TableCell({ borders, width: { size: 2400, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Device / connectivity", font: "Arial", size: 20 })] })] }),
              new TableCell({ borders, width: { size: 1440, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Medium (~8%)", font: "Arial", size: 20 })] })] }),
              new TableCell({ borders, width: { size: 3240, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Lighthouse box offline (red light). Dragino gateway down. Tuya device not found. WiFi issues.", font: "Arial", size: 20 })] })] }),
              new TableCell({ borders, width: { size: 2306, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Reset MCB, reconnect device, update firmware, power cycle.", font: "Arial", size: 20 })] })] }),
            ]}),
            new TableRow({ children: [
              new TableCell({ borders, width: { size: 2400, type: WidthType.DXA }, shading: { fill: LIGHT_GREY, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Scope / not our issue", font: "Arial", size: 20 })] })] }),
              new TableCell({ borders, width: { size: 1440, type: WidthType.DXA }, shading: { fill: LIGHT_GREY, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Medium (~10%)", font: "Arial", size: 20 })] })] }),
              new TableCell({ borders, width: { size: 3240, type: WidthType.DXA }, shading: { fill: LIGHT_GREY, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Boiler PCB fault. Toilet lights tripping. Signage broken. Bathroom lights. Boiler engineer blaming Lighthouse.", font: "Arial", size: 20 })] })] }),
              new TableCell({ borders, width: { size: 2306, type: WidthType.DXA }, shading: { fill: LIGHT_GREY, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Confirm not in scope. Redirect to electrician, boiler company, or GK.", font: "Arial", size: 20 })] })] }),
            ]}),
          ]
        }),

        new Paragraph({ children: [new PageBreak()] }),

        // ══════════════════════════════════════════════════════════════════════
        //  PAIN POINTS
        // ══════════════════════════════════════════════════════════════════════
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "6  Pain Points & Gaps", font: "Arial", size: 36, bold: true, color: BRAND_BLUE })] }),
        sectionSep(),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "6.1  For the OOH Call Handler", font: "Arial", size: 28, bold: true, color: ACCENT_BLUE })] }),
        bullet("No way to know if an issue is being looked at or has been resolved without refreshing the chat."),
        bullet("No quick reference for what Lighthouse actually controls at a specific site – leading to incorrect expectations being set with the site."),
        bullet("No script or triage guide for common issues, resulting in long calls while they wait for an IoT team response."),
        bullet("Inconsistent information required upfront – sometimes a call number is missed, slowing the callback."),
        bullet("Handlers sometimes miss messages in a busy chat thread, particularly when multiple concurrent issues are being discussed."),
        bullet("No way to log follow-up actions or confirm a site has been called back."),
        bullet("New site types (e.g. McDonald's in March 2026) introduced without prior briefing to OOH team."),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "6.2  For the IoT Support Team", font: "Arial", size: 28, bold: true, color: ACCENT_BLUE })] }),
        bullet("No prioritisation – all messages arrive in one thread with no urgency indicator. Business-critical kitchen equipment issues look the same as comfort requests."),
        bullet("No handover when going offline – if Sam goes offline mid-incident, the next person has no structured context."),
        bullet("Recurring issues (incorrect setpoints, missing commissioning reports, sites pressing override and disconnecting devices) create repeat contacts that could be prevented with better documentation and closure notes."),
        bullet("Contractor liaison happens ad hoc through the chat – no record of what was asked or agreed."),
        bullet("No proactive alert when a known high-volume event is occurring (e.g. power pause re-engagement across multiple sites)."),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "6.3  For Management & Reporting", font: "Arial", size: 28, bold: true, color: ACCENT_BLUE })] }),
        bullet("No data on OOH call volume, issue type distribution, resolution time, or repeat-contact rate."),
        bullet("No ability to identify systemic problems (e.g. a specific site model or device type generating a disproportionate number of calls)."),
        bullet("No audit trail for incidents involving contractors or engineers."),
        bullet("BDM approval workflow for setpoint changes is informal and undocumented."),

        new Paragraph({ children: [new PageBreak()] }),

        // ══════════════════════════════════════════════════════════════════════
        //  FUNCTIONAL REQUIREMENTS
        // ══════════════════════════════════════════════════════════════════════
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "7  Functional Requirements", font: "Arial", size: 36, bold: true, color: BRAND_BLUE })] }),
        sectionSep(),
        infoPara("Requirements are grouped by functional area. Priority ratings: P1 = Must Have, P2 = Should Have, P3 = Nice to Have."),

        // 7.1
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "7.1  Structured Ticket Creation", font: "Arial", size: 28, bold: true, color: ACCENT_BLUE })] }),
        body("The OOH handler must be able to raise a structured Zendesk ticket quickly while the site is still on the phone. The form should guide data capture without being burdensome."),

        new Paragraph({ spacing: { before: 160, after: 0 }, children: [] }),

        new Table({
          width: { size: 9386, type: WidthType.DXA },
          columnWidths: [2640, 2160, 2160, 2426],
          rows: [
            fourColRow("Requirement", "Priority", "User Story", "Acceptance Criteria", LIGHT_BLUE, true),
            fourColRow("Site number lookup", "P1", "As an OOH handler I want to type a site number and have the site name, address and Lighthouse configuration populated automatically.", "Entering a valid 4-digit site number auto-fills site name, address, device types installed, and BDM contact."),
            fourColRow("Issue category selector", "P1", "As an OOH handler I want to select from a predefined list of issue categories so I capture consistent data.", "Dropdown: Heating / Hot Water / External Lighting / Kitchen Equipment / Device Offline / Scope Query / Other."),
            fourColRow("Urgency indicator", "P1", "As an OOH handler I want to flag urgency so the IoT team can triage correctly.", "Three levels: Business Critical (kitchen down, hotel no hot water), Comfort (too hot/cold), Advisory (schedule query)."),
            fourColRow("Contact capture", "P1", "As an OOH handler I want to log the on-site contact name and number.", "Name and number fields, pre-populated if a previous ticket exists for the site within 7 days."),
            fourColRow("Free-text notes", "P1", "As an OOH handler I want to add verbatim notes from the call.", "Free-text field, character limit 500."),
            fourColRow("Contractor on site flag", "P2", "As an OOH handler I want to flag if a contractor is already on site and needs remote IoT support.", "Checkbox + contractor name field."),
          ]
        }),

        // 7.2
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "7.2  Site Information Panel", font: "Arial", size: 28, bold: true, color: ACCENT_BLUE })] }),
        body("When a ticket is raised (or selected), a side panel should display live and reference information about the site to help both the OOH handler and IoT team."),

        new Paragraph({ spacing: { before: 160, after: 0 }, children: [] }),

        new Table({
          width: { size: 9386, type: WidthType.DXA },
          columnWidths: [2640, 2160, 2160, 2426],
          rows: [
            fourColRow("Requirement", "Priority", "User Story", "Acceptance Criteria", LIGHT_BLUE, true),
            fourColRow("Installed device list", "P1", "As an IoT team member I want to see what Lighthouse devices are installed at the site so I know what we control.", "Lists device types (heating, lighting, power pause, Dragino, etc.) with last-seen timestamp."),
            fourColRow("Live sensor readings", "P1", "As an IoT team member I want to see current temperature, setpoint and device status without opening the Lighthouse portal separately.", "Shows current ambient temp, setpoint, device online/offline status. Refreshes every 60 seconds."),
            fourColRow("Scope reference", "P1", "As an OOH handler I want to know immediately what Lighthouse controls at this site so I can set expectations with the site.", "Clear 'we control' / 'we do not control' summary per site, maintained by the IoT team."),
            fourColRow("Recent ticket history", "P2", "As an IoT team member I want to see the last 5 tickets for this site to identify repeat issues.", "Displays last 5 closed tickets with category, date, and resolution summary."),
            fourColRow("BDM contact", "P2", "As an OOH handler I want quick access to the site BDM for approval-required changes.", "Displays BDM name and contact number."),
          ]
        }),

        // 7.3
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "7.3  Triage & Response Guidance", font: "Arial", size: 28, bold: true, color: ACCENT_BLUE })] }),
        body("The OOH handler should be guided through common issue types with scripted responses and triage steps, reducing reliance on the IoT team for straightforward contacts."),

        new Paragraph({ spacing: { before: 160, after: 0 }, children: [] }),

        new Table({
          width: { size: 9386, type: WidthType.DXA },
          columnWidths: [2640, 2160, 2160, 2426],
          rows: [
            fourColRow("Requirement", "Priority", "User Story", "Acceptance Criteria", LIGHT_BLUE, true),
            fourColRow("Issue triage guide", "P1", "As an OOH handler I want step-by-step guidance for each issue category so I can handle or triage calls confidently.", "Per-category flow: Is this in Lighthouse scope? → What to tell the site → When to escalate to IoT team."),
            fourColRow("Standard site scripts", "P2", "As an OOH handler I want suggested scripts to read to the site during the call.", "Pre-written holding messages and resolution scripts per issue type, editable by IoT management."),
            fourColRow("Scope decision tree", "P1", "As an OOH handler I want a quick 'Is this ours?' checker before escalating.", "Binary decision tree: Heating? Lighting? Kitchen? → Installed at this site? → Lighthouse controls this circuit? → Escalate or redirect."),
            fourColRow("Out-of-scope redirect guide", "P2", "As an OOH handler I want clear guidance on who to direct sites to when the issue is not Lighthouse.", "Per-category redirect: Boiler PCB → site's boiler maintenance contract. Fuse tripped → site electrician. Signage → pre-existing fault noted."),
          ]
        }),

        // 7.4
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "7.4  IoT Team Action Interface", font: "Arial", size: 28, bold: true, color: ACCENT_BLUE })] }),
        body("The IoT support team member must be able to view, action, and close tickets from the dashboard without needing to switch to the WhatsApp chat."),

        new Paragraph({ spacing: { before: 160, after: 0 }, children: [] }),

        new Table({
          width: { size: 9386, type: WidthType.DXA },
          columnWidths: [2640, 2160, 2160, 2426],
          rows: [
            fourColRow("Requirement", "Priority", "User Story", "Acceptance Criteria", LIGHT_BLUE, true),
            fourColRow("Ticket queue view", "P1", "As an IoT team member I want to see all open OOH tickets sorted by urgency and time.", "Sortable list: Business Critical first, then Comfort, then Advisory. Within each group, oldest first."),
            fourColRow("Claim / assign ticket", "P1", "As an IoT team member I want to claim a ticket so others know I am looking at it.", "One-click claim. Claimed tickets show the assignee's name and time claimed."),
            fourColRow("Resolution notes", "P1", "As an IoT team member I want to record what I did so the OOH handler can relay it to site.", "Required field before ticket can be closed. Automatically surfaced to the OOH handler view."),
            fourColRow("Callback request flag", "P1", "As an IoT team member I want to flag when the OOH handler needs to call the site back.", "Toggle that pushes a callback notification to the OOH handler's view."),
            fourColRow("Escalation to engineer", "P2", "As an IoT team member I want to log that an engineer has been dispatched with their details.", "Engineer name, company, contact number, and ETA field. Links to the ticket."),
            fourColRow("Repairs job log", "P2", "As an IoT team member I want to log a repairs job from within the ticket.", "Pre-filled repairs request form using site/device data from the ticket, submitted to the repairs queue."),
          ]
        }),

        // 7.5
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "7.5  Handover & Availability", font: "Arial", size: 28, bold: true, color: ACCENT_BLUE })] }),
        body("The current system relies entirely on individuals being available and checking the WhatsApp. The dashboard must support structured handover and availability signalling."),

        new Paragraph({ spacing: { before: 160, after: 0 }, children: [] }),

        new Table({
          width: { size: 9386, type: WidthType.DXA },
          columnWidths: [2640, 2160, 2160, 2426],
          rows: [
            fourColRow("Requirement", "Priority", "User Story", "Acceptance Criteria", LIGHT_BLUE, true),
            fourColRow("IoT team availability board", "P1", "As an OOH handler I want to know who from the IoT team is available tonight before I raise a ticket.", "Shows each IoT team member's status: Available / Limited (e.g. travelling) / Unavailable. Updated by the team member."),
            fourColRow("Handover notes", "P2", "As an IoT team member I want to leave a shift handover note visible to the next person on.", "Free-text handover field at team level, with timestamp. Visible on the dashboard home screen."),
            fourColRow("Proactive broadcast", "P2", "As an IoT team manager I want to broadcast a heads-up to OOH handlers about expected high-volume events.", "Post a message visible to all OOH handlers on the dashboard home screen (e.g. 'Power pause re-engagement today – expect heating calls')."),
          ]
        }),

        // 7.6
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "7.6  Knowledge Base & Reference", font: "Arial", size: 28, bold: true, color: ACCENT_BLUE })] }),
        body("The OOH handler and IoT team both need quick access to reference information that is currently scattered, unavailable, or shared ad hoc in chat."),

        new Paragraph({ spacing: { before: 160, after: 0 }, children: [] }),

        new Table({
          width: { size: 9386, type: WidthType.DXA },
          columnWidths: [2640, 2160, 2160, 2426],
          rows: [
            fourColRow("Requirement", "Priority", "User Story", "Acceptance Criteria", LIGHT_BLUE, true),
            fourColRow("Contractor directory", "P1", "As an OOH handler I want quick access to contractor contact details without hunting through the chat.", "Searchable directory: company name, contact name, phone, region, speciality. Maintained by IoT management."),
            fourColRow("Site type guide", "P1", "As an OOH handler I want to know if a new site type (e.g. McDonald's, hotel) has any different OOH procedures.", "Site-type flag visible on the site panel with a link to any specific guidance notes."),
            fourColRow("Common resolutions", "P2", "As an OOH handler I want to see common resolutions for this site's issue type based on ticket history.", "Automatically surfaces the most frequent resolution note for this site/category combination."),
            fourColRow("BDM approval threshold guide", "P2", "As an OOH handler I want to know when I need BDM sign-off before asking IoT to act.", "Inline guidance: setpoint changes beyond X degrees require BDM approval. Links to the approval process."),
          ]
        }),

        // 7.7
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "7.7  Reporting & Analytics", font: "Arial", size: 28, bold: true, color: ACCENT_BLUE })] }),
        body("Management need data to identify systemic issues, track OOH performance, and justify investment in preventative measures."),

        new Paragraph({ spacing: { before: 160, after: 0 }, children: [] }),

        new Table({
          width: { size: 9386, type: WidthType.DXA },
          columnWidths: [2640, 2160, 2160, 2426],
          rows: [
            fourColRow("Requirement", "Priority", "User Story", "Acceptance Criteria", LIGHT_BLUE, true),
            fourColRow("OOH call volume dashboard", "P2", "As a manager I want to see call volume by date, site, issue type, and resolution outcome.", "Filterable dashboard: date range, site, category, urgency, resolution type."),
            fourColRow("Repeat contact report", "P2", "As a manager I want to identify sites with disproportionate OOH contact.", "League table of sites by OOH ticket count over a rolling 30/90/180-day window."),
            fourColRow("Resolution time tracking", "P2", "As a manager I want to know average time from ticket raised to IoT team claiming, and from claim to resolution.", "Time metrics per category and per IoT team member."),
            fourColRow("Scope rejection rate", "P3", "As a manager I want to know what proportion of OOH contacts are not in Lighthouse scope.", "Percentage of tickets closed as 'Not In Scope' by category, to inform training and redirect processes."),
          ]
        }),

        new Paragraph({ children: [new PageBreak()] }),

        // ══════════════════════════════════════════════════════════════════════
        //  NON-FUNCTIONAL REQUIREMENTS
        // ══════════════════════════════════════════════════════════════════════
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "8  Non-Functional Requirements", font: "Arial", size: 36, bold: true, color: BRAND_BLUE })] }),
        sectionSep(),

        new Table({
          width: { size: 9386, type: WidthType.DXA },
          columnWidths: [2400, 6986],
          rows: [
            twoColRow("NFR", "Requirement", LIGHT_BLUE, true),
            twoColRow("Performance", "Ticket creation must complete in under 3 seconds. Site lookup must return in under 2 seconds. Live sensor readings must refresh within 60 seconds."),
            twoColRow("Mobile-friendliness", "The OOH handler interface must be fully usable on a smartphone browser – many handlers are fielding calls away from a desk. Core functions (raise ticket, view status, callback notification) must work on a 375px-wide viewport."),
            twoColRow("Reliability", "The dashboard must be available during all OOH hours (5pm–8am weekdays, all day weekends and bank holidays). Target uptime 99.5% during OOH windows."),
            twoColRow("Authentication", "Must use Airedale SSO (Azure AD). No separate username/password. Role-based access: OOH Handler vs IoT Support vs Management."),
            twoColRow("Audit trail", "All ticket actions (create, claim, update, close) must be time-stamped and attributed to the acting user. Audit log must be immutable."),
            twoColRow("No credential exposure", "Credentials must never appear in ticket notes, comments, or any user-facing field. Any field that might contain a password must be masked and flagged."),
            twoColRow("Accessibility", "WCAG 2.1 AA compliance. Must be usable with screen readers and keyboard-only navigation."),
          ]
        }),

        new Paragraph({ children: [new PageBreak()] }),

        // ══════════════════════════════════════════════════════════════════════
        //  OPEN QUESTIONS
        // ══════════════════════════════════════════════════════════════════════
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "9  Open Questions & Assumptions", font: "Arial", size: 36, bold: true, color: BRAND_BLUE })] }),
        sectionSep(),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "9.1  Questions for the IoT / Lighthouse Team", font: "Arial", size: 28, bold: true, color: ACCENT_BLUE })] }),
        bullet("Does the Lighthouse system expose a live API for sensor readings and device status that could feed the site panel?"),
        bullet("Is the Tuya account structure per-site or shared, and what access would be needed to surface readings in Zendesk?"),
        bullet("What is the current process for communicating new site types or expansions to the OOH team? Can this be formalised as a Zendesk broadcast?"),
        bullet("What is the exact BDM approval threshold for setpoint changes, and who can approve out of hours?"),
        bullet("Are commissioning completion reports a reliable data source for 'what is installed at this site'?"),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "9.2  Questions for the OOH Team", font: "Arial", size: 28, bold: true, color: ACCENT_BLUE })] }),
        bullet("What devices do OOH handlers use to access Zendesk – primarily mobile, desktop, or both?"),
        bullet("Is there appetite for the OOH handler to attempt any standard guidance steps with sites before escalating, or is the preference always to escalate immediately to the IoT team?"),
        bullet("Are there peak periods within OOH hours (e.g. early evening dinner service, late-night close) that should influence notification urgency logic?"),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "9.3  Assumptions", font: "Arial", size: 28, bold: true, color: ACCENT_BLUE })] }),
        bullet("Zendesk is the existing ticketing system and the OOH Dashboard will be built as a Zendesk app or sidebar widget."),
        bullet("The Teams channel history, once accessible, will supplement and may refine the requirements identified here."),
        bullet("A site master data source (site number → name, address, BDM, devices) exists or can be created to support the lookup feature."),
        bullet("The IoT team will maintain the knowledge base content (triage guides, scope references, contractor directory) once the dashboard is live."),

        new Paragraph({ children: [new PageBreak()] }),

        // ══════════════════════════════════════════════════════════════════════
        //  NEXT STEPS
        // ══════════════════════════════════════════════════════════════════════
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "10  Recommended Next Steps", font: "Arial", size: 36, bold: true, color: BRAND_BLUE })] }),
        sectionSep(),
        new Paragraph({ spacing: { before: 120, after: 0 }, children: [] }),
        bullet("Immediately: rotate Lighthouse/Tuya and WiFi credentials flagged in Section 1.", "numbers"),
        bullet("Resolve M365 connector access so Teams channel history can be exported and analysed to supplement these requirements.", "numbers"),
        bullet("Share this document with Sam Day and the OOH handlers (Kellie, Becky, Ju) for review and validation – they are the domain experts.", "numbers"),
        bullet("Prioritise a short discovery workshop with the OOH team to walk through the functional requirements and answer the open questions in Section 9.", "numbers"),
        bullet("Establish the site master data source and confirm Lighthouse API availability before beginning Zendesk development.", "numbers"),
        bullet("Produce a Zendesk app specification (UI wireframes, data model, API contract) based on the validated requirements.", "numbers"),
        bullet("Develop and test an MVP covering P1 requirements only. Run in parallel with WhatsApp for a pilot period to build confidence.", "numbers"),

        // ══════════════════════════════════════════════════════════════════════
        //  END
        // ══════════════════════════════════════════════════════════════════════
        new Paragraph({ spacing: { before: 400, after: 0 }, alignment: AlignmentType.CENTER,
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: MID_GREY, space: 4 } },
          children: [new TextRun({ text: "End of document – OOH Dashboard Requirements v0.1", font: "Arial", size: 18, color: "888888" })]
        }),
      ]
    }
  ]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("OOH-Dashboard-Requirements.docx", buffer);
  console.log("Created OOH-Dashboard-Requirements.docx");
});
