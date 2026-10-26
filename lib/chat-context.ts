import { db } from '@/db'
import { items, contas, contaMembers, orcamentos } from '@/db/schemas/schema'
import { eq, and, desc, inArray, or } from 'drizzle-orm'

export function fmtBrl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
}

export function parsearValor(t: string) {
  if (!t) return 0
  if (t.includes(',')) return parseFloat(t.replace(/\./g, '').replace(',', '.')) || 0
  return parseFloat(t) || 0
}

export function mesLabel(ym: string) {
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  const [y, m] = ym.split('-')
  return `${meses[parseInt(m, 10) - 1]} ${y}`
}

export function prevMes(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export async function getContasAcessiveis(userId: string): Promise<string[]> {
  const proprias = await db.select({ id: contas.id }).from(contas).where(eq(contas.userId, userId))
  const membros = await db
    .select({ contaId: contaMembers.contaId })
    .from(contaMembers)
    .where(and(eq(contaMembers.userId, userId), eq(contaMembers.status, 'active')))
  return [...proprias.map(c => c.id), ...membros.map(m => m.contaId)]
}

export async function loadFinanceSnapshot(userId: string, mes: string) {
  const mesAnt = prevMes(mes)
  const acessiveis = await getContasAcessiveis(userId)
  const visibilidade = acessiveis.length > 0
    ? or(eq(items.userId, userId), inArray(items.contaId, acessiveis))
    : eq(items.userId, userId)

  const [itensMes, itensMesAnt, contasUsuario, orcsUsuario] = await Promise.all([
    db.select().from(items).where(and(visibilidade, eq(items.mes, mes))).orderBy(desc(items.data)),
    db.select().from(items).where(and(visibilidade, eq(items.mes, mesAnt))).orderBy(desc(items.data)),
    acessiveis.length > 0
      ? db.select().from(contas).where(inArray(contas.id, acessiveis))
      : db.select().from(contas).where(eq(contas.userId, userId)),
    db.select().from(orcamentos).where(and(eq(orcamentos.userId, userId), eq(orcamentos.mes, mes))),
  ])

  const calc = (its: typeof itensMes) => {
    const receitas = its.filter(i => i.tipo === 'receita').reduce((a, i) => a + parsearValor(i.valor), 0)
    const despesas = its.filter(i => i.tipo === 'despesa').reduce((a, i) => a + parsearValor(i.valor), 0)
    const porCategoria: Record<string, number> = {}
    for (const i of its.filter(i => i.tipo === 'despesa')) {
      porCategoria[i.categoria] = (porCategoria[i.categoria] ?? 0) + parsearValor(i.valor)
    }
    return { receitas, despesas, saldo: receitas - despesas, porCategoria }
  }

  return {
    mes,
    mesAnt,
    itensMes,
    itensMesAnt,
    contasUsuario,
    orcsUsuario,
    totalMes: calc(itensMes),
    totalAnt: calc(itensMesAnt),
    recorrentes: itensMes.filter(i => i.recorrente).length,
  }
}
