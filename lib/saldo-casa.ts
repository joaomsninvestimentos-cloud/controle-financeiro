/** Na conta da casa, cada mês é independente, inclusive do saldo inicial cadastrado. */
export function calcularSaldoCasa(
  itens: Array<{ mes: string; tipo: string; valor: string }>,
  mes: string,
  parsearValor: (valor: string) => number,
) {
  const doMes = itens.filter(item => item.mes === mes)
  const receitas = doMes.filter(item => item.tipo === 'receita').reduce((total, item) => total + parsearValor(item.valor), 0)
  const despesas = doMes.filter(item => item.tipo === 'despesa').reduce((total, item) => total + parsearValor(item.valor), 0)
  return { saldoInicio: 0, receitas, despesas, saldoFim: receitas - despesas }
}
