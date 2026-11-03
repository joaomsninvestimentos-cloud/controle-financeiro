'use client'

import { useEffect, useState } from 'react'
import { Share, SquarePlus, X } from 'lucide-react'

/**
 * Inicialização do PWA em qualquer plataforma:
 * - registra o service worker (funciona offline e permite instalar);
 * - recarrega uma vez quando uma versão nova assume o controle;
 * - no iPhone/iPad, onde o iOS não tem `beforeinstallprompt`, mostra o passo a
 *   passo de "Adicionar à Tela de Início" (Safari → Compartilhar → Adicionar).
 */
export function ServiceWorkerRegistrar() {
  const [mostrarDicaIOS, setMostrarDicaIOS] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let recarregando = false
    navigator.serviceWorker.register('/sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const novo = reg.installing
        novo?.addEventListener('statechange', () => {
          if (novo.state === 'activated' && navigator.serviceWorker.controller && !recarregando) {
            recarregando = true
            window.location.reload()
          }
        })
      })
    }).catch(() => {})

    const ua = window.navigator.userAgent
    const ehIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document)
    const jaInstalado =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    const jaDispensou = localStorage.getItem('dica-ios-dispensada') === '1'

    if (ehIOS && !jaInstalado && !jaDispensou) {
      const t = setTimeout(() => setMostrarDicaIOS(true), 2500)
      return () => clearTimeout(t)
    }
  }, [])

  const dispensar = () => {
    localStorage.setItem('dica-ios-dispensada', '1')
    setMostrarDicaIOS(false)
  }

  if (!mostrarDicaIOS) return null

  return (
    <div className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-50 no-print">
      <div className="mx-auto max-w-sm bg-[#2D2A26] text-white rounded-2xl shadow-xl px-4 py-3 flex items-start gap-3">
        <SquarePlus size={18} className="text-[#8FB39A] shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 text-[12px] leading-relaxed">
          <p className="font-bold mb-0.5">Instalar no iPhone</p>
          <p className="text-white/80">
            No Safari, toque em <Share size={11} className="inline -mt-0.5" /> Compartilhar e depois em
            <strong className="text-white"> Adicionar à Tela de Início</strong>. O app abre em tela cheia,
            como um app de verdade.
          </p>
        </div>
        <button
          onClick={dispensar}
          aria-label="Fechar dica"
          className="p-1 -m-1 text-white/60 hover:text-white transition shrink-0"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
