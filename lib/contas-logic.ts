/**
 * Regras de "contas separadas" (pessoal / casa / tudo) — puras e testáveis.
 *
 * Modelo mental:
 *   - cada usuário tem UMA conta pessoal (privada);
 *   - a "casa" é uma conta compartilhada onde todos lançam e todos veem;
 *   - a visão "Tudo" soma o que o usuário pode acessar.
 */

export type TipoConta = 'pessoal' | 'casa'
export type Visao = 'pessoal' | 'casa' | 'tudo'

export const DIAS_VALIDADE_CONVITE = 7

export interface ContaResumo {
  id: string
  nome: string
  tipo: TipoConta
  isOwner: boolean
  cor?: string
  emoji?: string
}

export function tipoValido(valor: unknown): valor is TipoConta {
  return valor === 'pessoal' || valor === 'casa'
}

/**
 * Codinome do app: aceita 'tudo', 'todas' e ids de conta.
 * (o seletor antigo usava 'todas'; mantemos compatibilidade)
 */
export function normalizarContaSelecionada(valor: unknown): string | 'tudo' {
  if (typeof valor !== 'string' || valor.trim() === '') return 'pessoal'
  if (valor === 'tudo' || valor === 'todas') return 'tudo'
  return valor
}

export interface GrupoContas {
  pessoais: ContaResumo[]
  casas: ContaResumo[]
  /** Conta pessoal padrão (a primeira, normalmente a automática). */
  pessoalPadrao: ContaResumo | null
  /** Casa padrão (primeira compartilhada). */
  casaPadrao: ContaResumo | null
}

export function agruparContas(contas: ContaResumo[]): GrupoContas {
  const pessoais = contas.filter(c => c.tipo === 'pessoal')
  const casas = contas.filter(c => c.tipo === 'casa')
  return {
    pessoais,
    casas,
    pessoalPadrao: pessoais[0] ?? null,
    casaPadrao: casas[0] ?? null,
  }
}

/** Nome curto para a barra de troca rápida (primeiro nome, máx. 10 chars). */
export function nomeCurto(nome: string): string {
  const primeiro = nome.trim().split(/\s+/)[0] ?? ''
  if (primeiro.length <= 10) return primeiro
  return `${primeiro.slice(0, 9)}…`
}

/**
 * Resolve o que deve aparecer selecionado ao abrir o app:
 * 1. a última escolha do usuário, se ainda existe;
 * 2. a conta pessoal;
 * 3. a casa;
 * 4. "tudo" (se não houver conta nenhuma, ainda assim funciona).
 */
export function resolverSelecao(contas: ContaResumo[], ultimaEscolha?: string | null): string | 'tudo' {
  const grupos = agruparContas(contas)
  const escolha = normalizarContaSelecionada(ultimaEscolha ?? '')

  if (escolha === 'tudo') return 'tudo'
  if (escolha !== 'pessoal' && contas.some(c => c.id === escolha)) return escolha
  // 'pessoal' sem id = a conta pessoal do usuário
  if (escolha === 'pessoal' && grupos.pessoalPadrao) return grupos.pessoalPadrao.id

  return grupos.pessoalPadrao?.id ?? grupos.casaPadrao?.id ?? 'tudo'
}

/** Ids das contas visíveis conforme a visão escolhida. */
export function idsDaVisao(contas: ContaResumo[], visao: string | 'tudo'): string[] {
  if (visao === 'tudo') return contas.map(c => c.id)
  const alvo = contas.find(c => c.id === visao)
  if (alvo) return [alvo.id]
  const grupos = agruparContas(contas)
  if (visao === 'pessoal') return grupos.pessoais.map(c => c.id)
  if (visao === 'casa') return grupos.casas.map(c => c.id)
  return grupos.pessoalPadrao ? [grupos.pessoalPadrao.id] : contas.map(c => c.id)
}

export function rotuloVisao(contas: ContaResumo[], visao: string | 'tudo'): string {
  if (visao === 'tudo') return 'Tudo'
  const alvo = contas.find(c => c.id === visao)
  return alvo ? alvo.nome : 'Tudo'
}

/* ───────────────────────── Convites ───────────────────────── */

export interface ConviteEstado {
  status: string
  inviteToken: string | null
  inviteExpiresAt?: Date | string | null
  inviteUsedAt?: Date | string | null
  userId?: string | null
}

export type ResultadoConvite =
  | { ok: true; estado: 'pendente' | 'ja_membro' }
  | { ok: false; motivo: 'invalido' | 'expirado' | 'usado' }

function paraData(valor: Date | string | null | undefined): Date | null {
  if (!valor) return null
  const d = valor instanceof Date ? valor : new Date(valor)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Um convite só vale se: existe token, não foi usado, não expirou e o membro
 * ainda não está ativo. Se o usuário já é membro ativo, é "ja_membro" (não é
 * erro): a tela só o leva para a conta.
 */
export function avaliarConvite(
  convite: ConviteEstado | null | undefined,
  usuarioId: string,
  agora: Date = new Date(),
): ResultadoConvite {
  if (!convite || !convite.inviteToken) return { ok: false, motivo: 'invalido' }
  if (convite.inviteUsedAt) return { ok: false, motivo: 'usado' }

  const expira = paraData(convite.inviteExpiresAt)
  if (expira && expira.getTime() <= agora.getTime()) return { ok: false, motivo: 'expirado' }

  if (convite.status === 'active' && convite.userId === usuarioId) {
    return { ok: true, estado: 'ja_membro' }
  }

  return { ok: true, estado: 'pendente' }
}

export function validadeConvite(agora: Date = new Date(), dias = DIAS_VALIDADE_CONVITE): Date {
  return new Date(agora.getTime() + dias * 24 * 60 * 60 * 1000)
}

export function diasRestantes(expira: Date | string | null | undefined, agora: Date = new Date()): number {
  const d = paraData(expira)
  if (!d) return 0
  const diff = d.getTime() - agora.getTime()
  return diff <= 0 ? 0 : Math.ceil(diff / (24 * 60 * 60 * 1000))
}

/** Link absoluto do convite (funciona no navegador e no WhatsApp). */
export function linkConvite(origem: string, token: string): string {
  const base = origem.replace(/\/+$/, '')
  return `${base}/convite/${token}`
}

/** URL do WhatsApp com a mensagem pronta. */
export function linkWhatsApp(link: string, nomeConta: string, nomeDono?: string): string {
  const quem = nomeDono ? `${nomeDono} te convidou` : 'Você foi convidado(a)'
  const texto = `${quem} para a conta "${nomeConta}" no Meu Controle Financeiro.\n\nAbra o link para entrar (vale 7 dias):\n${link}`
  return `https://wa.me/?text=${encodeURIComponent(texto)}`
}

/** Nome padrão da conta pessoal criada no cadastro. */
export function nomeContaPessoal(nomeUsuario: string): string {
  const primeiro = nomeCurto(nomeUsuario).replace(/…$/, '')
  return primeiro ? primeiro : 'Minha conta'
}
