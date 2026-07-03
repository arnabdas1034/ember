import { app, shell } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun
} from 'docx'
import ExcelJS from 'exceljs'
import PptxGenJS from 'pptxgenjs'
import { writeFile } from 'node:fs/promises'

// Document generation — Claude produces real, downloadable Office files (Word,
// Excel, PowerPoint), saved to ~/Downloads/Ember. Client-executed tools.

function outDir(): string {
  const dir = join(app.getPath('downloads'), 'Ember')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function safeName(name: string, ext: string): string {
  let base = String(name || 'document').replace(/[^\w.\- ]+/g, '_').replace(/\.[^.]+$/, '')
  if (!base.trim()) base = 'document'
  return `${base}.${ext}`
}

export const FILE_TOOLS = [
  {
    name: 'create_docx',
    description:
      'Create a Microsoft Word (.docx) document saved to the user\'s Downloads/Ember folder. Provide an ordered list of blocks.',
    input_schema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'File name without extension.' },
        blocks: {
          type: 'array',
          description: 'Ordered content blocks.',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['title', 'heading', 'subheading', 'paragraph', 'bullet', 'numbered'] },
              text: { type: 'string' }
            },
            required: ['type', 'text']
          }
        }
      },
      required: ['filename', 'blocks']
    }
  },
  {
    name: 'create_xlsx',
    description: 'Create a Microsoft Excel (.xlsx) spreadsheet saved to Downloads/Ember. First row of each sheet is treated as a header.',
    input_schema: {
      type: 'object',
      properties: {
        filename: { type: 'string' },
        sheets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              rows: { type: 'array', items: { type: 'array', items: {} } }
            },
            required: ['name', 'rows']
          }
        }
      },
      required: ['filename', 'sheets']
    }
  },
  {
    name: 'create_pptx',
    description: 'Create a PowerPoint (.pptx) presentation saved to Downloads/Ember.',
    input_schema: {
      type: 'object',
      properties: {
        filename: { type: 'string' },
        slides: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              bullets: { type: 'array', items: { type: 'string' } },
              subtitle: { type: 'string' }
            },
            required: ['title']
          }
        }
      },
      required: ['filename', 'slides']
    }
  }
]

const FILE_TOOL_NAMES = new Set(FILE_TOOLS.map((t) => t.name))
export function isFileTool(name: string): boolean {
  return FILE_TOOL_NAMES.has(name)
}

async function makeDocx(input: any): Promise<string> {
  const children = (input.blocks || []).map((b: any) => {
    const text = String(b.text || '')
    switch (b.type) {
      case 'title':
        return new Paragraph({ text, heading: HeadingLevel.TITLE })
      case 'heading':
        return new Paragraph({ text, heading: HeadingLevel.HEADING_1 })
      case 'subheading':
        return new Paragraph({ text, heading: HeadingLevel.HEADING_2 })
      case 'bullet':
        return new Paragraph({ text, bullet: { level: 0 } })
      case 'numbered':
        return new Paragraph({ text, numbering: { reference: 'num', level: 0 } })
      default:
        return new Paragraph({ children: [new TextRun(text)] })
    }
  })
  const doc = new Document({
    numbering: { config: [{ reference: 'num', levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: 'start' }] }] },
    sections: [{ children }]
  })
  const path = join(outDir(), safeName(input.filename, 'docx'))
  await writeFile(path, await Packer.toBuffer(doc))
  return path
}

async function makeXlsx(input: any): Promise<string> {
  const wb = new ExcelJS.Workbook()
  for (const sheet of input.sheets || []) {
    const ws = wb.addWorksheet(String(sheet.name || 'Sheet').slice(0, 31))
    const rows = sheet.rows || []
    rows.forEach((r: any[], i: number) => {
      const row = ws.addRow(r)
      if (i === 0) row.font = { bold: true }
    })
    ws.columns.forEach((col: any) => {
      let max = 10
      col.eachCell?.({ includeEmpty: false }, (cell: any) => {
        max = Math.max(max, String(cell.value ?? '').length + 2)
      })
      col.width = Math.min(60, max)
    })
  }
  const path = join(outDir(), safeName(input.filename, 'xlsx'))
  await wb.xlsx.writeFile(path)
  return path
}

async function makePptx(input: any): Promise<string> {
  const pptx = new PptxGenJS()
  for (const slide of input.slides || []) {
    const s = pptx.addSlide()
    s.addText(String(slide.title || ''), { x: 0.5, y: 0.3, w: 9, h: 1, fontSize: 28, bold: true, color: '2A2622' })
    if (slide.subtitle) s.addText(String(slide.subtitle), { x: 0.5, y: 1.2, w: 9, h: 0.6, fontSize: 16, color: 'CC785C' })
    const bullets = (slide.bullets || []).map((b: string) => ({ text: String(b), options: { bullet: true, fontSize: 18, color: '3A3530' } }))
    if (bullets.length) s.addText(bullets as any, { x: 0.7, y: 2, w: 8.6, h: 4 })
  }
  const path = join(outDir(), safeName(input.filename, 'pptx'))
  await pptx.writeFile({ fileName: path })
  return path
}

export async function runFileTool(name: string, input: any): Promise<{ content: string; isError: boolean }> {
  try {
    let path = ''
    if (name === 'create_docx') path = await makeDocx(input)
    else if (name === 'create_xlsx') path = await makeXlsx(input)
    else if (name === 'create_pptx') path = await makePptx(input)
    else return { content: `Unknown file tool: ${name}`, isError: true }
    // Reveal the folder so the user can grab the file immediately.
    shell.showItemInFolder(path)
    return { content: `Saved to ${path} (opened in Finder).`, isError: false }
  } catch (e: any) {
    return { content: `File generation failed: ${e?.message || e}`, isError: true }
  }
}
