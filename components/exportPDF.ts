// PDF export utility — runs only in browser (jsPDF is client-only)
import type { Item, Conta, Orcamento } from './FinanceApp'

function parsear(t: string) {
  if (!t) return 0
  if (t.includes(',')) return parseFloat(t.replace(/\./g, '').replace(',', '.')) || 0
  return parseFloat(t) || 0
}

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
}

function fmtData(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function fmtMes(ym: string) {
  const [y, m] = ym.split('-')
  return `${MESES[parseInt(m,10)-1]} ${y}`
}

// Color helpers
function hexToRgb(hex: string): [number,number,number] {
  const r = parseInt(hex.slice(1,3),16)
  const g = parseInt(hex.slice(3,5),16)
  const b = parseInt(hex.slice(5,7),16)
  return [r,g,b]
}

export async function exportarPDF(
  items: Item[],
  contas: Conta[],
  orcamentos: Orcamento[],
  mes: string,
  nomeUsuario: string,
) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210
  const verde: [number,number,number] = [143, 179, 154]  // #8FB39A
  const rosa: [number,number,number]  = [212, 160, 160]  // #D4A0A0
  const escuro: [number,number,number] = [45, 42, 38]    // #2D2A26
  const cinza: [number,number,number] = [140, 133, 124]  // #8C857C
  const creme: [number,number,number] = [250, 246, 241]  // #FAF6F1

  let y = 0

  // ── Cabeçalho ──────────────────────────────────────────────────────────────
  doc.setFillColor(...verde)
  doc.rect(0, 0, W, 38, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('Meu Controle Financeiro', 14, 15)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(`Relatório de ${fmtMes(mes)}`, 14, 23)
  doc.setFontSize(9)
  doc.text(`Usuário: ${nomeUsuario}   |   Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 31)
  y = 46

  // ── Totais ─────────────────────────────────────────────────────────────────
  const receitas = items.filter(i => i.tipo === 'receita').reduce((a,i) => a + parsear(i.valor), 0)
  const despesas = items.filter(i => i.tipo === 'despesa').reduce((a,i) => a + parsear(i.valor), 0)
  const saldo = receitas - despesas

  // Cards de resumo
  const cardW = 55, cardH = 22, gap = 8, startX = 14
  const cards = [
    { label: 'Receitas', valor: receitas, cor: verde },
    { label: 'Despesas', valor: despesas, cor: rosa },
    { label: 'Saldo', valor: saldo, cor: saldo >= 0 ? verde : rosa },
  ]
  cards.forEach((c, i) => {
    const x = startX + i * (cardW + gap)
    doc.setFillColor(...creme)
    doc.roundedRect(x, y, cardW, cardH, 3, 3, 'F')
    doc.setFillColor(...c.cor)
    doc.rect(x, y, 3, cardH, 'F')
    doc.setTextColor(...cinza)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.text(c.label.toUpperCase(), x + 6, y + 7)
    doc.setTextColor(...escuro)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text(fmtBRL(c.valor), x + 6, y + 16)
  })
  y += cardH + 10

  // ── Gastos por categoria ───────────────────────────────────────────────────
  const porCat: Record<string, number> = {}
  for (const i of items.filter(i => i.tipo === 'despesa')) {
    porCat[i.categoria] = (porCat[i.categoria] ?? 0) + parsear(i.valor)
  }
  const cats = Object.entries(porCat).sort((a,b) => b[1]-a[1])

  if (cats.length > 0) {
    doc.setTextColor(...escuro)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Despesas por Categoria', 14, y)
    y += 4

    autoTable(doc, {
      startY: y,
      head: [['Categoria', 'Valor', '% do Total']],
      body: cats.map(([cat, val]) => [
        cat,
        fmtBRL(val),
        `${Math.round(val / despesas * 100)}%`,
      ]),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: verde, textColor: [255,255,255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: creme },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'center' } },
      margin: { left: 14, right: 14 },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  // ── Orçamentos ─────────────────────────────────────────────────────────────
  if (orcamentos.length > 0) {
    doc.setTextColor(...escuro)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Orçamentos do Mês', 14, y)
    y += 4

    autoTable(doc, {
      startY: y,
      head: [['Categoria', 'Limite', 'Gasto', 'Restante', 'Status']],
      body: orcamentos.map(o => {
        const gasto = porCat[o.categoria] ?? 0
        const limite = parsear(o.limite)
        const pct = Math.round(gasto / limite * 100)
        return [
          o.categoria,
          fmtBRL(limite),
          fmtBRL(gasto),
          fmtBRL(Math.max(0, limite - gasto)),
          `${pct}% ${gasto > limite ? '⚠ Excedeu' : pct >= 80 ? '⚡ Atenção' : '✓ OK'}`,
        ]
      }),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [160, 180, 212] as [number,number,number], textColor: [255,255,255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: creme },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'center' } },
      margin: { left: 14, right: 14 },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  // ── Lançamentos ────────────────────────────────────────────────────────────
  // Nova página se necessário
  if (y > 220) { doc.addPage(); y = 14 }

  doc.setTextColor(...escuro)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('Lançamentos do Mês', 14, y)
  y += 4

  autoTable(doc, {
    startY: y,
    head: [['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor']],
    body: items.map(i => {
      const contaNome = contas.find(c => c.id === i.contaId)?.nome ?? ''
      return [
        fmtData(i.data),
        i.descricao + (contaNome ? ` (${contaNome})` : ''),
        i.categoria,
        i.tipo === 'receita' ? 'Receita' : 'Despesa',
        fmtBRL(parsear(i.valor)),
      ]
    }),
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: escuro, textColor: [255,255,255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: creme },
    bodyStyles: {},
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 3) {
        if (data.cell.raw === 'Receita') {
          data.cell.styles.textColor = verde
          data.cell.styles.fontStyle = 'bold'
        } else {
          data.cell.styles.textColor = rosa
        }
      }
      if (data.section === 'body' && data.column.index === 4) {
        data.cell.styles.halign = 'right'
      }
    },
    margin: { left: 14, right: 14 },
  })

  // ── Rodapé ─────────────────────────────────────────────────────────────────
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFillColor(...creme)
    doc.rect(0, 285, W, 12, 'F')
    doc.setTextColor(...cinza)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text('Meu Controle Financeiro — Relatório gerado automaticamente', 14, 292)
    doc.text(`Página ${p} de ${pages}`, W - 14, 292, { align: 'right' })
  }

  doc.save(`relatorio-${mes}.pdf`)
}
