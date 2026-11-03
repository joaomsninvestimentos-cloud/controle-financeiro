/**
 * Guarda-corpo da configuração PWA (iPhone / Android / Windows).
 * Não substitui teste em aparelho, mas impede regressões bobas de manifesto,
 * ícones e metas que quebram a instalação em silêncio.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const raiz = new URL('../', import.meta.url)

function ler(caminho: string): string {
  return readFileSync(new URL(caminho, raiz), 'utf8')
}

const manifest = JSON.parse(ler('public/manifest.json')) as {
  name: string
  short_name: string
  start_url: string
  scope: string
  display: string
  display_override?: string[]
  lang: string
  background_color: string
  theme_color: string
  icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>
}

test('manifest tem os campos que iOS/Windows exigem para instalar', () => {
  assert.equal(manifest.display, 'standalone')
  assert.ok(manifest.display_override?.includes('standalone'))
  assert.equal(manifest.lang, 'pt-BR')
  assert.equal(manifest.start_url.startsWith('/'), true)
  assert.equal(manifest.scope, '/')
  assert.match(manifest.theme_color, /^#[0-9A-Fa-f]{6}$/)
  assert.match(manifest.background_color, /^#[0-9A-Fa-f]{6}$/)
  assert.ok(manifest.name.length <= 45, 'nome do app deve caber na tela inicial')
  assert.ok(manifest.short_name.length <= 12)
  // "any" na orientação evita travar o iPad na vertical
  const bruto = ler('public/manifest.json')
  assert.match(bruto, /"orientation": "any"/)
})

test('manifest tem ícone 192 e 512, com um maskable (Android/Windows)', () => {
  const tamanhos = manifest.icons.map(i => i.sizes)
  assert.ok(tamanhos.includes('192x192'))
  assert.ok(tamanhos.includes('512x512'))
  assert.ok(manifest.icons.some(i => i.type === 'image/png'))
  assert.ok(
    manifest.icons.some(i => (i.purpose ?? '').includes('maskable')),
    'faltando ícone maskable',
  )
})

test('os arquivos de ícone existem em public/', () => {
  for (const icone of manifest.icons) {
    const conteudo = readFileSync(new URL(`public${icone.src}`, raiz))
    assert.ok(conteudo.length > 0, `${icone.src} vazio`)
    // assinatura PNG
    assert.equal(conteudo[1], 0x50)
    assert.equal(conteudo[2], 0x4e)
    assert.equal(conteudo[3], 0x47)
  }
})

test('layout declara appleWebApp, viewport-fit=cover e apple touch icon', () => {
  const layout = ler('app/layout.tsx')
  assert.match(layout, /appleWebApp/)
  assert.match(layout, /capable:\s*true/)
  assert.match(layout, /statusBarStyle/)
  assert.match(layout, /viewportFit:\s*'cover'/)
  assert.match(layout, /apple:\s*\[/)
  assert.match(layout, /manifest:\s*'\/manifest\.json'/)
  assert.match(layout, /interactiveWidget:\s*'resizes-content'/)
})

test('CSS cobre iOS (zoom em inputs) e Windows (scrollbar, foco)', () => {
  const css = ler('app/globals.css')
  // iOS: campos com 16px para o Safari não dar zoom ao focar
  assert.match(css, /-webkit-text-size-adjust/)
  assert.match(css, /@supports \(-webkit-touch-callout: none\)/)
  assert.match(css, /font-size: 16px/)
  // áreas seguras do notch
  assert.match(css, /env\(safe-area-inset/)
  // toque sem atraso e sem flash cinza
  assert.match(css, /touch-action: manipulation/)
  assert.match(css, /-webkit-tap-highlight-color/)
  // Windows/desktop
  assert.match(css, /scrollbar-width: thin/)
  assert.match(css, /:focus-visible/)
  // acessibilidade de movimento
  assert.match(css, /prefers-reduced-motion/)
})

test('service worker tem versão de cache e não intercepta API', () => {
  const sw = ler('public/sw.js')
  assert.match(sw, /const CACHE_NAME = 'financas-v\d+'/)
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/)
})
