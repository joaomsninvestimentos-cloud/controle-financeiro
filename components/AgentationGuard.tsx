'use client'

import { Agentation, type Annotation } from 'agentation'
import {
  setAgentationFeedbackMode,
  subscribeAgentationFeedbackFromParent,
} from '@/lib/agentationFeedbackMode'
import { useCallback, useEffect, useRef } from 'react'

function postPreviewCopy(text: string) {
  const parentOrigin =
    new URLSearchParams(window.location.search).get('parentOrigin') ?? '*'
  window.parent.postMessage({ type: 'PREVIEW_COPY', text }, parentOrigin)
}

function displayPathname() {
  if (typeof window === 'undefined') return ''
  return (
    window.location.pathname +
    window.location.search +
    window.location.hash
  )
}

/** Aligned with agentation's default "standard" export format, for the parent window to populate the description input */
function buildStandardMarkdown(annotations: Annotation[]) {
  if (annotations.length === 0) return ''
  const viewport =
    typeof window !== 'undefined'
      ? `${window.innerWidth}×${window.innerHeight}`
      : 'unknown'
  const pathname = displayPathname()
  let output = `## Page Feedback: ${pathname}
`
  output += `**Viewport:** ${viewport}
`
  output += '\n'
  annotations.forEach((a, i) => {
    output += `### ${i + 1}. ${a.element}
`
    output += `**Location:** ${a.elementPath}
`
    if (a.sourceFile) {
      output += `**Source:** ${a.sourceFile}
`
    }
    if (a.reactComponents) {
      output += `**React:** ${a.reactComponents}
`
    }
    if (a.selectedText) {
      output += `**Selected text:** "${a.selectedText}"
`
    }
    output += `**Feedback:** ${a.comment}

`
  })
  return output.trim()
}

export function AgentationGuard() {
  const annotationsRef = useRef<Annotation[]>([])

  const syncPreview = useCallback(() => {
    const text = buildStandardMarkdown(annotationsRef.current)
    if (text) postPreviewCopy(text)
  }, [])

  const onAnnotationAdd = useCallback(
    (annotation: Annotation) => {
      annotationsRef.current = [...annotationsRef.current, annotation]
      syncPreview()
    },
    [syncPreview]
  )

  const onAnnotationUpdate = useCallback(
    (annotation: Annotation) => {
      annotationsRef.current = annotationsRef.current.map((a) =>
        a.id === annotation.id ? annotation : a
      )
      syncPreview()
    },
    [syncPreview]
  )

  const onAnnotationDelete = useCallback(
    (annotation: Annotation) => {
      annotationsRef.current = annotationsRef.current.filter(
        (a) => a.id !== annotation.id
      )
      syncPreview()
    },
    [syncPreview]
  )

  const onAnnotationsClear = useCallback(() => {
    annotationsRef.current = []
  }, [])

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return

    const unsubMessage = subscribeAgentationFeedbackFromParent()

    const w = window as Window & {
      __vibeAgentation?: { setFeedbackMode: (enabled: boolean) => void }
    }
    w.__vibeAgentation = {
      setFeedbackMode: setAgentationFeedbackMode,
    }

    return () => {
      unsubMessage()
      delete w.__vibeAgentation
    }
  }, [])

  if (process.env.NODE_ENV !== 'development') {
    return null
  }

  return (
    <Agentation
      className='hidden'
      copyToClipboard={false}
      onAnnotationAdd={onAnnotationAdd}
      onAnnotationUpdate={onAnnotationUpdate}
      onAnnotationDelete={onAnnotationDelete}
      onAnnotationsClear={onAnnotationsClear}
    />
  )
}
