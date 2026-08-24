'use client'

import {
  ResponsiveContainer,
  PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, Area, AreaChart,
} from 'recharts'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Item {
  id: string
  descricao: string
  valor: string
  tipo: string
  categoria: string
  data: string
}

interface Props { items: Item[] }

// ─── Paleta ───────────────────────────────────────────────────────────────────

const CORES: Record<string, string> = {
  Alimentação: '#E8A87C', Transporte: '#B8A9D4', Moradia: '#8FB39A',
  Saúde: '#D4A0A0', Educação: '#6AACB8', Lazer: '#F0C47E',
  Roupas: '#C4956A', Serviços: '#7CC4B4', Outros: '#B0B0B0',
  Salário: '#5FAD8E', Freelance: '#7DB88A', Investimentos: '#6AACB8',
  Presente: '#C47CB8',
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

// ─── Utilitários ─────────────────────────────────────────────────────────────

function parsear(t: string) {
  if (!t) return 0
  if (t.includes(',')) return parseFloat(t.replace(/\./g, '').replace(',', '.')) || 0
  return parseFloat(t) || 0
}

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })

// ─── Tooltip customizado ─────────────────────────────────────────────────────

function TooltipCustom({ active, payload, label }: { active?: boolean; payload?: {name:string;value:number;color:string}[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white rounded-2xl shadow-lg px-4 py-3 text-xs font-nunito border border-[rgba(45,42,38,0.06)]">
      {label && <p className="text-[#8C857C] font-semibold mb-1">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-[#2D2A26] font-bold">{brl(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Label customizado para pizza ────────────────────────────────────────────

function PizzaLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: {
  cx: number; cy: number; midAngle: number
  innerRadius: number; outerRadius: number; percent: number
}) {
  if (percent < 0.05) return null
  const RADIAN = Math.PI / 180
  const r = innerRadius + (outerRadius - innerRadius) * 0.55
  const x = cx + r * Math.cos(-midAngle * RADIAN)
  const y = cy + r * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
      fontSize={11} fontWeight={700} fontFamily="Nunito, sans-serif">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function GraficosView({ items }: Props) {
  // ── Cálculos base ─────────────────────────────────────────────────────────
  const totalReceitas = items.filter(i => i.tipo === 'receita').reduce((a, i) => a + parsear(i.valor), 0)
  const totalDespesas = items.filter(i => i.tipo === 'despesa').reduce((a, i) => a + parsear(i.valor), 0)
  const saldo = totalReceitas - totalDespesas

  // ── Pizza: despesas por categoria ────────────────────────────────────────
  const catDespesas = Object.entries(
    items.filter(i => i.tipo === 'despesa').reduce<Record<string, number>>((acc, i) => {
      acc[i.categoria] = (acc[i.categoria] ?? 0) + parsear(i.valor)
      return acc
    }, {})
  ).map(([name, value]) => ({ name, value }))
   .sort((a, b) => b.value - a.value)

  // ── Pizza: receitas por categoria ────────────────────────────────────────
  const catReceitas = Object.entries(
    items.filter(i => i.tipo === 'receita').reduce<Record<string, number>>((acc, i) => {
      acc[i.categoria] = (acc[i.categoria] ?? 0) + parsear(i.valor)
      return acc
    }, {})
  ).map(([name, value]) => ({ name, value }))
   .sort((a, b) => b.value - a.value)

  // ── Barras por mês (ano atual) ────────────────────────────────────────────
  const anoAtual = new Date().getFullYear()
  const porMes = MESES.map((mes, idx) => {
    const m = String(idx + 1).padStart(2, '0')
    const prefixo = `${anoAtual}-${m}`
    const rec = items.filter(i => i.tipo === 'receita' && i.data.startsWith(prefixo)).reduce((a, i) => a + parsear(i.valor), 0)
    const desp = items.filter(i => i.tipo === 'despesa' && i.data.startsWith(prefixo)).reduce((a, i) => a + parsear(i.valor), 0)
    return { mes, Receitas: rec, Despesas: desp }
  }).filter(m => m.Receitas > 0 || m.Despesas > 0)

  // ── Linha: evolução do saldo ao longo do tempo ────────────────────────────
  const sorted = [...items].sort((a, b) => a.data.localeCompare(b.data))
  let acum = 0
  const evolucao = sorted.reduce<{ data: string; Saldo: number }[]>((acc, i) => {
    acum += i.tipo === 'receita' ? parsear(i.valor) : -parsear(i.valor)
    const [y, m, d] = i.data.split('-')
    const label = `${d}/${m}`
    // Atualiza se já tem a mesma data, senão adiciona
    const last = acc[acc.length - 1]
    if (last?.data === label) { last.Saldo = acum; return acc }
    return [...acc, { data: label, Saldo: acum }]
  }, [])

  return (
    <div className="space-y-4">

      {/* Cards resumo animados */}
      <div className="grid grid-cols-3 gap-3">
        <ResumoCard label="Receitas" valor={totalReceitas} cor="#8FB39A" bg="bg-[#8FB39A]/10" />
        <ResumoCard label="Despesas" valor={totalDespesas} cor="#D4A0A0" bg="bg-[#D4A0A0]/10" />
        <ResumoCard label="Saldo" valor={saldo} cor={saldo >= 0 ? '#8FB39A' : '#D4A0A0'} bg={saldo >= 0 ? 'bg-[#8FB39A]/10' : 'bg-[#D4A0A0]/10'} />
      </div>

      {/* Barras por mês */}
      {porMes.length > 0 && (
        <Card titulo="📅 Receitas vs Despesas por Mês">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={porMes} barSize={16} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(45,42,38,0.05)" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#8C857C', fontFamily: 'Nunito' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : `${v}`} tick={{ fontSize: 10, fill: '#8C857C' }} axisLine={false} tickLine={false} width={32} />
              <Tooltip content={<TooltipCustom />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, fontFamily: 'Nunito', paddingTop: 8 }} />
              <Bar dataKey="Receitas" fill="#8FB39A" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Despesas" fill="#D4A0A0" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Linha: evolução do saldo */}
      {evolucao.length > 1 && (
        <Card titulo="📈 Evolução do Saldo">
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={evolucao}>
              <defs>
                <linearGradient id="gradSaldo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8FB39A" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#8FB39A" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradSaldoNeg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#D4A0A0" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#D4A0A0" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(45,42,38,0.05)" vertical={false} />
              <XAxis dataKey="data" tick={{ fontSize: 10, fill: '#8C857C', fontFamily: 'Nunito' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : `${v}`} tick={{ fontSize: 10, fill: '#8C857C' }} axisLine={false} tickLine={false} width={32} />
              <Tooltip content={<TooltipCustom />} />
              <Area
                type="monotone"
                dataKey="Saldo"
                stroke={evolucao[evolucao.length - 1]?.Saldo >= 0 ? '#8FB39A' : '#D4A0A0'}
                strokeWidth={2.5}
                fill={evolucao[evolucao.length - 1]?.Saldo >= 0 ? 'url(#gradSaldo)' : 'url(#gradSaldoNeg)'}
                dot={{ fill: '#fff', strokeWidth: 2, r: 3, stroke: '#8FB39A' }}
                activeDot={{ r: 5, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Pizza: despesas por categoria */}
      {catDespesas.length > 0 && (
        <Card titulo="💸 Onde está gastando mais">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={catDespesas}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={88}
                paddingAngle={2}
                dataKey="value"
                labelLine={false}
                label={PizzaLabel}
              >
                {catDespesas.map((e, i) => (
                  <Cell key={i} fill={CORES[e.name] ?? '#B0B0B0'} stroke="white" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => [brl(v), '']} contentStyle={{ borderRadius: 16, border: 'none', boxShadow: '0 4px 20px rgba(45,42,38,0.1)', fontSize: 12, fontFamily: 'Nunito' }} />
            </PieChart>
          </ResponsiveContainer>
          {/* Legenda customizada com valor e % */}
          <div className="space-y-2 mt-1">
            {catDespesas.map(d => {
              const pct = totalDespesas > 0 ? (d.value / totalDespesas * 100).toFixed(0) : '0'
              return (
                <div key={d.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: CORES[d.name] ?? '#B0B0B0' }} />
                    <span className="text-xs text-[#2D2A26] font-semibold">{d.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#8C857C]">{pct}%</span>
                    <span className="text-xs font-bold text-[#D4A0A0]">{brl(d.value)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Pizza: receitas por categoria */}
      {catReceitas.length > 0 && (
        <Card titulo="💰 De onde vem sua renda">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={catReceitas}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={88}
                paddingAngle={2}
                dataKey="value"
                labelLine={false}
                label={PizzaLabel}
              >
                {catReceitas.map((e, i) => (
                  <Cell key={i} fill={CORES[e.name] ?? '#8FB39A'} stroke="white" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => [brl(v), '']} contentStyle={{ borderRadius: 16, border: 'none', boxShadow: '0 4px 20px rgba(45,42,38,0.1)', fontSize: 12, fontFamily: 'Nunito' }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-1">
            {catReceitas.map(d => {
              const pct = totalReceitas > 0 ? (d.value / totalReceitas * 100).toFixed(0) : '0'
              return (
                <div key={d.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: CORES[d.name] ?? '#8FB39A' }} />
                    <span className="text-xs text-[#2D2A26] font-semibold">{d.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#8C857C]">{pct}%</span>
                    <span className="text-xs font-bold text-[#8FB39A]">{brl(d.value)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function Card({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-3xl p-5 shadow-snug">
      <h3 className="font-bold text-[#2D2A26] text-sm mb-4">{titulo}</h3>
      {children}
    </div>
  )
}

function ResumoCard({ label, valor, cor, bg }: { label: string; valor: number; cor: string; bg: string }) {
  return (
    <div className={`${bg} rounded-2xl p-3 flex flex-col gap-1 shadow-snug`}>
      <span className="text-[#8C857C] text-[10px] font-bold uppercase tracking-wide">{label}</span>
      <span className="font-extrabold text-sm leading-tight" style={{ color: cor }}>
        {valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })}
      </span>
    </div>
  )
}
