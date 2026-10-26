/** Formatação/parse de valores e meses — módulo puro (sem DB), reutilizável em testes. */

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
