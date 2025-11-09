import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: [
    "https://openai.com/chat*",
    "https://chatgpt.com/*",
    "https://claude.ai/chat*",
    "https://claude.ai/new*"
  ],
  all_frames: false
}

type ScoreData = { score: number; rewrite: string; goal?: string; revisedScore?: number }
type ScoreReply = { ok: true; data: ScoreData } | { ok: false; error: string }

type PromptTemplate = {
  id: string
  title: string
  prompt: string
  category: string
  score?: number
  timestamp: number
  isFavorite?: boolean
  isChain?: boolean
  chainSteps?: Array<{ prompt: string; response?: string }>
}

// Track last prompt for sidebar display
let lastOriginalPrompt = ""
let lastScoreData: ScoreData | null = null
let currentTab: "results" | "settings" | "history" = "results"
let lastAIResponse = ""
let hasConversation = false
let suggestedNextPrompts: string[] = []
let promptHistory: PromptTemplate[] = []
let selectedCategory: string = "all"

const SITE = (() => {
  const h = location.hostname
  if (h.includes("claude.ai")) return "claude"
  if (h.includes("chat.openai.com") || h.includes("chatgpt.com"))
    return "chatgpt"
  return "other"
})()

const COMPOSER_SELECTORS = [
  // ChatGPT
  'textarea[id="prompt-textarea"]',
  'textarea[placeholder*="Message"]',
  'div[contenteditable="true"][data-placeholder*="Message"]',
  // Claude - updated selectors
  'div[contenteditable="true"]',
  'textarea[placeholder*="message"]',
  'div[contenteditable="true"][data-testid="message-editor"]',
  'main div[contenteditable="true"]',
  'div[role="textbox"]',
  'fieldset div[contenteditable="true"]',
  'p[data-placeholder]'
]

// ---------------------------------------------------------------------
// Editor helpers
// ---------------------------------------------------------------------
function getComposer(): HTMLTextAreaElement | HTMLElement | null {
  for (const s of COMPOSER_SELECTORS) {
    const el = document.querySelector<HTMLElement>(s)
    if (el) return el
  }
  return null
}

function dispatchAllInputEvents(el: HTMLElement) {
  el.dispatchEvent(new Event("input", { bubbles: true }))
  el.dispatchEvent(new Event("change", { bubbles: true }))
  try {
    el.dispatchEvent(new InputEvent("input", { bubbles: true }))
  } catch {}
}

function setCaretToEnd(el: HTMLElement) {
  try {
    const sel = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    sel?.removeAllRanges()
    sel?.addRange(range)
  } catch {}
}

function getText(el: HTMLElement): string {
  if ((el as HTMLTextAreaElement).value !== undefined) {
    return (el as HTMLTextAreaElement).value || ""
  }
  return el.innerText || el.textContent || ""
}

function setText(el: HTMLElement, text: string) {
  if (el instanceof HTMLTextAreaElement) {
    const d = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )
    d?.set?.call(el, text)
    dispatchAllInputEvents(el)
    el.focus()
    return
  }
  if (el.getAttribute("contenteditable") === "true") {
    el.textContent = text
    setCaretToEnd(el)
    dispatchAllInputEvents(el)
    el.focus()
    return
  }
}

// ---------------------------------------------------------------------
// Beautiful sidebar (closed by default)
// ---------------------------------------------------------------------
function ensureSidebar(): HTMLElement {
  let sb = document.getElementById("cwc-sidebar")
  if (sb) return sb

  sb = document.createElement("div")
  sb.id = "cwc-sidebar"
  Object.assign(sb.style, {
    position: "fixed",
    top: "0",
    right: "0",
    width: "420px",
    height: "100vh",
    background: "#ffffff",
    borderLeft: "1px solid #e5e7eb",
    boxShadow: "-8px 0 24px rgba(0,0,0,0.08)",
    padding: "0",
    fontFamily:
      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSize: "14px",
    zIndex: "2147483647",
    overflowY: "auto",
    display: "none",
    transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
  } as CSSStyleDeclaration)

  // Professional header
  const header = document.createElement("div")
  Object.assign(header.style, {
    background: "#ffffff",
    borderBottom: "1px solid #e5e7eb",
    padding: "24px",
    position: "sticky",
    top: "0",
    zIndex: "10"
  })

  const titleRow = document.createElement("div")
  Object.assign(titleRow.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "20px"
  })

  const title = document.createElement("div")
  title.innerHTML = '<span style="font-weight: 600; font-size: 16px; color: #111827; letter-spacing: -0.01em">Prompt Optimizer</span>'

  const close = document.createElement("button")
  close.textContent = "×"
  Object.assign(close.style, {
    width: "28px",
    height: "28px",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    background: "transparent",
    color: "#6b7280",
    fontSize: "24px",
    fontWeight: "300",
    transition: "all 0.15s",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  })
  close.addEventListener("mouseenter", () => {
    close.style.background = "#f3f4f6"
    close.style.color = "#111827"
  })
  close.addEventListener("mouseleave", () => {
    close.style.background = "transparent"
    close.style.color = "#6b7280"
  })
  close.addEventListener("click", () => toggleSidebar(false))

  titleRow.appendChild(title)
  titleRow.appendChild(close)
  header.appendChild(titleRow)

  // Tab bar
  const tabBar = document.createElement("div")
  Object.assign(tabBar.style, {
    display: "flex",
    gap: "4px",
    background: "#f9fafb",
    padding: "4px",
    borderRadius: "8px"
  })

  const resultsTab = createTab("results", "Results", true)
  const historyTab = createTab("history", "Library", false)
  const settingsTab = createTab("settings", "Settings", false)

  resultsTab.addEventListener("click", () => switchTab("results"))
  historyTab.addEventListener("click", () => switchTab("history"))
  settingsTab.addEventListener("click", () => switchTab("settings"))

  tabBar.appendChild(resultsTab)
  tabBar.appendChild(historyTab)
  tabBar.appendChild(settingsTab)
  header.appendChild(tabBar)

  // Content area
  const content = document.createElement("div")
  content.id = "cwc-content"
  Object.assign(content.style, {
    padding: "24px",
    overflowY: "auto",
    maxHeight: "calc(100vh - 140px)"
  })

  sb.appendChild(header)
  sb.appendChild(content)
  document.documentElement.appendChild(sb)
  return sb
}

function createTab(id: string, label: string, active: boolean): HTMLElement {
  const tab = document.createElement("button")
  tab.id = `cwc-tab-${id}`
  tab.textContent = label
  tab.setAttribute("data-tab", id)
  Object.assign(tab.style, {
    flex: "1",
    padding: "8px 12px",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "500",
    transition: "all 0.15s",
    background: active ? "#ffffff" : "transparent",
    color: active ? "#111827" : "#6b7280",
    boxShadow: active ? "0 1px 3px rgba(0,0,0,0.1)" : "none"
  } as CSSStyleDeclaration)

  tab.addEventListener("mouseenter", () => {
    if (!active) {
      tab.style.background = "#f3f4f6"
      tab.style.color = "#111827"
    }
  })
  tab.addEventListener("mouseleave", () => {
    const isActive = tab.style.background === "#ffffff" || tab.style.boxShadow === "0 1px 3px rgba(0,0,0,0.1)" || tab.style.boxShadow === "rgba(0, 0, 0, 0.1) 0px 1px 3px"
    if (!isActive) {
      tab.style.background = "transparent"
      tab.style.color = "#6b7280"
    }
  })

  return tab
}

function switchTab(tab: "results" | "settings" | "history") {
  currentTab = tab

  // Update tab styling
  const resultsTab = document.getElementById("cwc-tab-results")
  const historyTab = document.getElementById("cwc-tab-history")
  const settingsTab = document.getElementById("cwc-tab-settings")

  const tabs = [
    { id: "cwc-tab-results", isActive: tab === "results" },
    { id: "cwc-tab-history", isActive: tab === "history" },
    { id: "cwc-tab-settings", isActive: tab === "settings" }
  ]

  tabs.forEach(({ id, isActive }) => {
    const tabEl = document.getElementById(id)
    if (tabEl) {
      if (isActive) {
        tabEl.style.background = "#ffffff"
        tabEl.style.color = "#111827"
        tabEl.style.boxShadow = "0 1px 3px rgba(0,0,0,0.1)"
      } else {
        tabEl.style.background = "transparent"
        tabEl.style.color = "#6b7280"
        tabEl.style.boxShadow = "none"
      }
    }
  })

  // Render content based on tab
  renderContent()
}

function renderContent() {
  if (currentTab === "results") {
    if (lastScoreData) {
      updateSidebarContent(lastOriginalPrompt, lastScoreData)
    } else {
      renderNoResults()
    }
  } else if (currentTab === "history") {
    renderHistory()
  } else if (currentTab === "settings") {
    renderSettings()
  }
}

function renderNoResults() {
  const content = document.getElementById("cwc-content")
  if (!content) return

  content.innerHTML = `
    <div style="text-align: center; padding: 60px 32px; color: #9ca3af;">
      <div style="width: 48px; height: 48px; background: #f3f4f6; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 20px; color: #6b7280;">↑</div>
      <div style="font-size: 15px; font-weight: 500; margin-bottom: 6px; color: #374151;">No Results Yet</div>
      <div style="font-size: 13px; color: #9ca3af;">Optimize a prompt to see analysis</div>
    </div>
  `
}

function renderSuggestion() {
  const content = document.getElementById("cwc-content")
  if (!content) return

  content.innerHTML = ""

  // Header
  const header = document.createElement("div")
  Object.assign(header.style, {
    marginBottom: "24px"
  })
  header.innerHTML = `
    <div style="font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 6px;">Suggested Next Prompts</div>
    <div style="font-size: 13px; color: #6b7280; line-height: 1.5;">Continue the conversation with these follow-up prompts</div>
  `
  content.appendChild(header)

  // Loop through suggestions and create a card for each
  suggestedNextPrompts.forEach((suggestion, index) => {
    const suggestionWrapper = document.createElement("div")
    Object.assign(suggestionWrapper.style, {
      marginBottom: "20px"
    })

    // Suggestion card
    const suggestionCard = document.createElement("div")
    Object.assign(suggestionCard.style, {
      background: "#ffffff",
      border: "1px solid #e5e7eb",
      borderRadius: "8px",
      padding: "16px",
      marginBottom: "10px",
      fontSize: "13px",
      lineHeight: "1.6",
      color: "#374151",
      whiteSpace: "pre-wrap",
      wordWrap: "break-word"
    })
    suggestionCard.textContent = suggestion
    suggestionWrapper.appendChild(suggestionCard)

    // Use button for this specific suggestion
    const useBtn = document.createElement("button")
    useBtn.textContent = "Use This Prompt"
    Object.assign(useBtn.style, {
      width: "100%",
      padding: "10px",
      border: "none",
      borderRadius: "6px",
      background: "#3b82f6",
      color: "white",
      fontSize: "13px",
      fontWeight: "500",
      cursor: "pointer",
      transition: "all 0.15s"
    } as CSSStyleDeclaration)

    useBtn.addEventListener("mouseenter", () => {
      useBtn.style.background = "#2563eb"
    })
    useBtn.addEventListener("mouseleave", () => {
      useBtn.style.background = "#3b82f6"
    })
    useBtn.addEventListener("click", () => {
      const composer = getComposer()
      if (composer) {
        setText(composer, suggestion)
        toast("Prompt added")
        toggleSidebar(false)
      }
    })
    suggestionWrapper.appendChild(useBtn)

    content.appendChild(suggestionWrapper)
  })
}

function renderHistory() {
  const content = document.getElementById("cwc-content")
  if (!content) return

  content.innerHTML = ""

  // Load history from storage
  chrome.storage.local.get(["promptHistory"], (result) => {
    promptHistory = result.promptHistory || []

    // Header
    const header = document.createElement("div")
    Object.assign(header.style, {
      marginBottom: "20px"
    })
    header.innerHTML = `
      <div style="font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 6px;">Prompt Library</div>
      <div style="font-size: 13px; color: #6b7280; line-height: 1.5;">Save and reuse your optimized prompts</div>
    `
    content.appendChild(header)

    // Save buttons
    const buttonGroup = document.createElement("div")
    Object.assign(buttonGroup.style, {
      display: "flex",
      gap: "8px",
      marginBottom: "16px"
    })

    // Save current prompt button
    if (lastOriginalPrompt && lastScoreData) {
      const saveBtn = document.createElement("button")
      saveBtn.textContent = "Save Current"
      Object.assign(saveBtn.style, {
        flex: "1",
        padding: "10px",
        border: "1px solid #e5e7eb",
        borderRadius: "6px",
        background: "#3b82f6",
        color: "white",
        fontSize: "13px",
        fontWeight: "500",
        cursor: "pointer",
        transition: "all 0.15s"
      } as CSSStyleDeclaration)

      saveBtn.addEventListener("mouseenter", () => {
        saveBtn.style.background = "#2563eb"
      })
      saveBtn.addEventListener("mouseleave", () => {
        saveBtn.style.background = "#3b82f6"
      })
      saveBtn.addEventListener("click", () => showSaveDialog(false))
      buttonGroup.appendChild(saveBtn)
    }

    // Save conversation chain button
    if (hasConversation) {
      const chainBtn = document.createElement("button")
      chainBtn.textContent = "Save Chain"
      Object.assign(chainBtn.style, {
        flex: "1",
        padding: "10px",
        border: "1px solid #e5e7eb",
        borderRadius: "6px",
        background: "#10b981",
        color: "white",
        fontSize: "13px",
        fontWeight: "500",
        cursor: "pointer",
        transition: "all 0.15s"
      } as CSSStyleDeclaration)

      chainBtn.addEventListener("mouseenter", () => {
        chainBtn.style.background = "#059669"
      })
      chainBtn.addEventListener("mouseleave", () => {
        chainBtn.style.background = "#10b981"
      })
      chainBtn.addEventListener("click", () => showSaveDialog(true))
      buttonGroup.appendChild(chainBtn)
    }

    if (buttonGroup.children.length > 0) {
      content.appendChild(buttonGroup)
    }

    // Action bar with categories and export
    const actionBar = document.createElement("div")
    Object.assign(actionBar.style, {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "20px",
      gap: "12px"
    })

    // Category filter
    const categories = ["all", "coding", "writing", "analysis", "creative", "other"]
    const categoryBar = document.createElement("div")
    Object.assign(categoryBar.style, {
      display: "flex",
      gap: "8px",
      flexWrap: "wrap",
      flex: "1"
    })

    categories.forEach(cat => {
      const catBtn = document.createElement("button")
      catBtn.textContent = cat === "all" ? "All" : cat.charAt(0).toUpperCase() + cat.slice(1)
      const isActive = selectedCategory === cat
      Object.assign(catBtn.style, {
        padding: "6px 12px",
        border: "1px solid #e5e7eb",
        borderRadius: "6px",
        fontSize: "12px",
        fontWeight: "500",
        cursor: "pointer",
        background: isActive ? "#3b82f6" : "#ffffff",
        color: isActive ? "white" : "#6b7280",
        transition: "all 0.15s"
      } as CSSStyleDeclaration)

      catBtn.addEventListener("mouseenter", () => {
        if (!isActive) {
          catBtn.style.background = "#f9fafb"
        }
      })
      catBtn.addEventListener("mouseleave", () => {
        if (!isActive) {
          catBtn.style.background = "#ffffff"
        }
      })
      catBtn.addEventListener("click", () => {
        selectedCategory = cat
        renderHistory()
      })
      categoryBar.appendChild(catBtn)
    })
    actionBar.appendChild(categoryBar)

    // Export/Import buttons
    const exportImportBar = document.createElement("div")
    Object.assign(exportImportBar.style, {
      display: "flex",
      gap: "6px"
    })

    const exportBtn = document.createElement("button")
    exportBtn.textContent = "↓"
    exportBtn.title = "Export prompts"
    Object.assign(exportBtn.style, {
      padding: "6px 10px",
      border: "1px solid #e5e7eb",
      borderRadius: "6px",
      fontSize: "14px",
      cursor: "pointer",
      background: "#ffffff",
      color: "#6b7280",
      transition: "all 0.15s"
    } as CSSStyleDeclaration)
    exportBtn.addEventListener("mouseenter", () => {
      exportBtn.style.background = "#f9fafb"
    })
    exportBtn.addEventListener("mouseleave", () => {
      exportBtn.style.background = "#ffffff"
    })
    exportBtn.addEventListener("click", () => showExportDialog())
    exportImportBar.appendChild(exportBtn)

    const importBtn = document.createElement("button")
    importBtn.textContent = "↑"
    importBtn.title = "Import prompts"
    Object.assign(importBtn.style, {
      padding: "6px 10px",
      border: "1px solid #e5e7eb",
      borderRadius: "6px",
      fontSize: "14px",
      cursor: "pointer",
      background: "#ffffff",
      color: "#6b7280",
      transition: "all 0.15s"
    } as CSSStyleDeclaration)
    importBtn.addEventListener("mouseenter", () => {
      importBtn.style.background = "#f9fafb"
    })
    importBtn.addEventListener("mouseleave", () => {
      importBtn.style.background = "#ffffff"
    })
    importBtn.addEventListener("click", () => showImportDialog())
    exportImportBar.appendChild(importBtn)

    actionBar.appendChild(exportImportBar)
    content.appendChild(actionBar)

    // Filter prompts
    const filtered = selectedCategory === "all"
      ? promptHistory
      : promptHistory.filter(p => p.category === selectedCategory)

    // Sort by favorites first, then by timestamp
    filtered.sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1
      if (!a.isFavorite && b.isFavorite) return 1
      return b.timestamp - a.timestamp
    })

    if (filtered.length === 0) {
      const empty = document.createElement("div")
      Object.assign(empty.style, {
        textAlign: "center",
        padding: "60px 32px",
        color: "#9ca3af"
      })
      empty.innerHTML = `
        <div style="width: 48px; height: 48px; background: #f3f4f6; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 20px; color: #6b7280;">+</div>
        <div style="font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 6px;">No saved prompts yet</div>
        <div style="font-size: 12px; color: #9ca3af;">Optimize and save prompts to your library</div>
      `
      content.appendChild(empty)
      return
    }

    // Render prompts
    filtered.forEach(template => {
      const card = document.createElement("div")
      Object.assign(card.style, {
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        padding: "14px",
        marginBottom: "10px",
        cursor: "pointer",
        transition: "all 0.15s"
      })

      card.addEventListener("mouseenter", () => {
        card.style.borderColor = "#d1d5db"
        card.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"
      })
      card.addEventListener("mouseleave", () => {
        card.style.borderColor = "#e5e7eb"
        card.style.boxShadow = "none"
      })

      // Header row with title and actions
      const headerRow = document.createElement("div")
      Object.assign(headerRow.style, {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "8px"
      })

      const titleSection = document.createElement("div")
      Object.assign(titleSection.style, {
        flex: "1"
      })

      const title = document.createElement("div")
      title.textContent = `${template.isFavorite ? "★ " : ""}${template.title}`
      Object.assign(title.style, {
        fontSize: "13px",
        fontWeight: "600",
        color: "#111827",
        marginBottom: "6px"
      })
      titleSection.appendChild(title)

      const meta = document.createElement("div")
      Object.assign(meta.style, {
        fontSize: "11px",
        color: "#6b7280",
        display: "flex",
        gap: "8px",
        alignItems: "center",
        flexWrap: "wrap"
      })
      meta.innerHTML = `
        <span style="background: #eff6ff; padding: 3px 8px; border-radius: 4px; color: #3b82f6; font-weight: 500;">${template.category}</span>
        ${template.isChain ? `<span style="background: #f0fdf4; padding: 3px 8px; border-radius: 4px; color: #10b981; font-weight: 500;">${template.chainSteps?.length || 0} steps</span>` : ""}
        ${template.score ? `<span style="color: #6b7280;">${template.score}/100</span>` : ""}
        <span style="color: #9ca3af;">${new Date(template.timestamp).toLocaleDateString()}</span>
      `
      titleSection.appendChild(meta)
      headerRow.appendChild(titleSection)

      // Action buttons
      const actions = document.createElement("div")
      Object.assign(actions.style, {
        display: "flex",
        gap: "6px"
      })

      const favoriteBtn = document.createElement("button")
      favoriteBtn.textContent = template.isFavorite ? "★" : "☆"
      favoriteBtn.title = "Toggle favorite"
      Object.assign(favoriteBtn.style, {
        width: "28px",
        height: "28px",
        border: "1px solid #e5e7eb",
        borderRadius: "6px",
        background: "#ffffff",
        cursor: "pointer",
        fontSize: "14px",
        color: template.isFavorite ? "#f59e0b" : "#9ca3af",
        transition: "all 0.15s"
      } as CSSStyleDeclaration)
      favoriteBtn.addEventListener("mouseenter", () => {
        favoriteBtn.style.background = "#f9fafb"
      })
      favoriteBtn.addEventListener("mouseleave", () => {
        favoriteBtn.style.background = "#ffffff"
      })
      favoriteBtn.addEventListener("click", (e) => {
        e.stopPropagation()
        toggleFavorite(template.id)
      })
      actions.appendChild(favoriteBtn)

      const deleteBtn = document.createElement("button")
      deleteBtn.textContent = "×"
      deleteBtn.title = "Delete"
      Object.assign(deleteBtn.style, {
        width: "28px",
        height: "28px",
        border: "1px solid #e5e7eb",
        borderRadius: "6px",
        background: "#ffffff",
        cursor: "pointer",
        fontSize: "18px",
        color: "#9ca3af",
        transition: "all 0.15s"
      } as CSSStyleDeclaration)
      deleteBtn.addEventListener("mouseenter", () => {
        deleteBtn.style.background = "#fef2f2"
        deleteBtn.style.color = "#ef4444"
        deleteBtn.style.borderColor = "#fecaca"
      })
      deleteBtn.addEventListener("mouseleave", () => {
        deleteBtn.style.background = "#ffffff"
        deleteBtn.style.color = "#9ca3af"
        deleteBtn.style.borderColor = "#e5e7eb"
      })
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation()
        deleteTemplate(template.id)
      })
      actions.appendChild(deleteBtn)

      headerRow.appendChild(actions)
      card.appendChild(headerRow)

      // Prompt preview
      const preview = document.createElement("div")
      preview.textContent = template.prompt.length > 100
        ? template.prompt.substring(0, 100) + "..."
        : template.prompt
      Object.assign(preview.style, {
        fontSize: "12px",
        color: "#6b7280",
        lineHeight: "1.5",
        marginBottom: "10px"
      })
      card.appendChild(preview)

      // Use button
      const useBtn = document.createElement("button")
      useBtn.textContent = template.isChain ? "Start Chain" : "Use Prompt"
      Object.assign(useBtn.style, {
        width: "100%",
        padding: "8px",
        border: "none",
        borderRadius: "6px",
        background: template.isChain ? "#10b981" : "#3b82f6",
        color: "white",
        fontSize: "12px",
        fontWeight: "500",
        cursor: "pointer",
        transition: "all 0.15s"
      } as CSSStyleDeclaration)

      useBtn.addEventListener("mouseenter", () => {
        useBtn.style.background = template.isChain ? "#059669" : "#2563eb"
      })
      useBtn.addEventListener("mouseleave", () => {
        useBtn.style.background = template.isChain ? "#10b981" : "#3b82f6"
      })

      useBtn.addEventListener("click", (e) => {
        e.stopPropagation()
        if (template.isChain && template.chainSteps) {
          // Show chain execution view
          showChainExecution(template)
        } else {
          const composer = getComposer()
          if (composer) {
            setText(composer, template.prompt)
            toast("Prompt loaded")
            toggleSidebar(false)
          }
        }
      })
      card.appendChild(useBtn)

      content.appendChild(card)
    })
  })
}

function showChainExecution(template: PromptTemplate) {
  const content = document.getElementById("cwc-content")
  if (!content) return

  content.innerHTML = ""

  // Header
  const header = document.createElement("div")
  header.innerHTML = `
    <div style="font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 6px;">${template.title}</div>
    <div style="font-size: 13px; color: #6b7280; margin-bottom: 20px;">Execute ${template.chainSteps?.length || 0}-step conversation workflow</div>
  `
  content.appendChild(header)

  // Chain steps
  template.chainSteps?.forEach((step, i) => {
    const stepCard = document.createElement("div")
    Object.assign(stepCard.style, {
      marginBottom: "10px",
      padding: "12px",
      background: "#ffffff",
      border: "1px solid #e5e7eb",
      borderRadius: "6px"
    })

    const stepHeader = document.createElement("div")
    stepHeader.textContent = `Step ${i + 1}`
    Object.assign(stepHeader.style, {
      fontSize: "11px",
      fontWeight: "600",
      color: "#6b7280",
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      marginBottom: "8px"
    })
    stepCard.appendChild(stepHeader)

    const promptText = document.createElement("div")
    promptText.textContent = step.prompt
    Object.assign(promptText.style, {
      fontSize: "12px",
      lineHeight: "1.5",
      color: "#111827",
      marginBottom: step.response ? "8px" : "0"
    })
    stepCard.appendChild(promptText)

    if (step.response) {
      const responseText = document.createElement("div")
      const shortResponse = step.response.length > 100 ? step.response.substring(0, 100) + "..." : step.response
      responseText.textContent = shortResponse
      Object.assign(responseText.style, {
        fontSize: "11px",
        lineHeight: "1.4",
        color: "#6b7280",
        paddingLeft: "12px",
        borderLeft: "2px solid #e5e7eb"
      })
      stepCard.appendChild(responseText)
    }

    content.appendChild(stepCard)
  })

  // Actions
  const btnRow = document.createElement("div")
  Object.assign(btnRow.style, {
    display: "flex",
    gap: "8px",
    marginTop: "16px"
  })

  const backBtn = document.createElement("button")
  backBtn.textContent = "← Back"
  Object.assign(backBtn.style, {
    flex: "1",
    padding: "10px",
    border: "1px solid #e5e7eb",
    borderRadius: "6px",
    background: "white",
    color: "#6b7280",
    fontSize: "13px",
    fontWeight: "500",
    cursor: "pointer",
    transition: "all 0.15s"
  } as CSSStyleDeclaration)
  backBtn.addEventListener("mouseenter", () => {
    backBtn.style.background = "#f9fafb"
  })
  backBtn.addEventListener("mouseleave", () => {
    backBtn.style.background = "white"
  })
  backBtn.addEventListener("click", () => renderHistory())
  btnRow.appendChild(backBtn)

  const startBtn = document.createElement("button")
  startBtn.textContent = "Start First Prompt"
  Object.assign(startBtn.style, {
    flex: "1",
    padding: "10px",
    border: "none",
    borderRadius: "6px",
    background: "#10b981",
    color: "white",
    fontSize: "13px",
    fontWeight: "500",
    cursor: "pointer",
    transition: "all 0.15s"
  } as CSSStyleDeclaration)

  startBtn.addEventListener("mouseenter", () => {
    startBtn.style.background = "#059669"
  })
  startBtn.addEventListener("mouseleave", () => {
    startBtn.style.background = "#10b981"
  })

  startBtn.addEventListener("click", () => {
    if (template.chainSteps && template.chainSteps.length > 0) {
      const composer = getComposer()
      if (composer) {
        setText(composer, template.chainSteps[0].prompt)
        toast(`Chain started (Step 1/${template.chainSteps.length})`)
        toggleSidebar(false)
      }
    }
  })
  btnRow.appendChild(startBtn)

  // Replay All button (experimental)
  const replayBtn = document.createElement("button")
  replayBtn.textContent = "Auto-Replay"
  Object.assign(replayBtn.style, {
    flex: "1",
    padding: "10px",
    border: "1px solid #e5e7eb",
    borderRadius: "6px",
    background: "#f59e0b",
    color: "white",
    fontSize: "13px",
    fontWeight: "500",
    cursor: "pointer",
    transition: "all 0.15s"
  } as CSSStyleDeclaration)

  replayBtn.addEventListener("mouseenter", () => {
    replayBtn.style.background = "#d97706"
  })
  replayBtn.addEventListener("mouseleave", () => {
    replayBtn.style.background = "#f59e0b"
  })

  replayBtn.addEventListener("click", () => {
    if (template.chainSteps && template.chainSteps.length > 0) {
      toast("Auto-replay started")
      toggleSidebar(false)
      replayChain(template.chainSteps)
    }
  })
  btnRow.appendChild(replayBtn)

  content.appendChild(btnRow)
}

function showSaveDialog(isChain: boolean = false) {
  const content = document.getElementById("cwc-content")
  if (!content) return

  content.innerHTML = ""

  const header = document.createElement("div")
  header.innerHTML = `<div style="font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 16px;">${isChain ? 'Save Conversation Chain' : 'Save Prompt'}</div>`
  content.appendChild(header)

  // Loading message while inferring
  const loadingMsg = document.createElement("div")
  Object.assign(loadingMsg.style, {
    textAlign: "center",
    padding: "32px 20px",
    color: "#6b7280",
    fontSize: "13px"
  })
  loadingMsg.innerHTML = `
    <div style="width: 40px; height: 40px; border: 3px solid #f3f4f6; border-top-color: #3b82f6; border-radius: 50%; margin: 0 auto 12px; animation: spin 0.8s linear infinite;"></div>
    <div>${isChain ? 'Analyzing conversation...' : 'Analyzing prompt...'}</div>
  `

  // Add spin animation if not exists
  if (!document.getElementById("cwc-spin-styles")) {
    const style = document.createElement("style")
    style.id = "cwc-spin-styles"
    style.textContent = `
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `
    document.head.appendChild(style)
  }

  content.appendChild(loadingMsg)

  // Get conversation chain if saving chain
  const conversationChain = isChain ? extractConversationChain() : []

  // Infer metadata
  const promptToAnalyze = isChain
    ? (conversationChain.length > 0 ? conversationChain[0].prompt : lastOriginalPrompt)
    : (lastScoreData?.rewrite || lastOriginalPrompt)
  chrome.runtime.sendMessage(
    { type: "inferMetadata", prompt: promptToAnalyze },
    (reply: any) => {
      // Remove loading message
      content.innerHTML = ""

      // Re-add header
      const header = document.createElement("div")
      header.innerHTML = `<div style="font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 16px;">Save Prompt</div>`
      content.appendChild(header)

      const inferredTitle = reply?.ok ? reply.data.title : (lastScoreData?.goal || "")
      const inferredCategory = reply?.ok ? reply.data.category : "other"

      // Title input
      const titleLabel = document.createElement("label")
      titleLabel.textContent = "Title"
      Object.assign(titleLabel.style, {
        display: "block",
        fontSize: "13px",
        fontWeight: "600",
        color: "#475569",
        marginBottom: "8px"
      })
      content.appendChild(titleLabel)

      const titleInput = document.createElement("input")
      titleInput.type = "text"
      titleInput.placeholder = "e.g., Code review prompt"
      titleInput.value = inferredTitle
      Object.assign(titleInput.style, {
        width: "100%",
        padding: "10px",
        border: "2px solid #e2e8f0",
        borderRadius: "8px",
        fontSize: "13px",
        marginBottom: "16px",
        boxSizing: "border-box"
      } as CSSStyleDeclaration)
      content.appendChild(titleInput)

      // Category select
      const catLabel = document.createElement("label")
      catLabel.textContent = "Category"
      Object.assign(catLabel.style, {
        display: "block",
        fontSize: "13px",
        fontWeight: "600",
        color: "#475569",
        marginBottom: "8px"
      })
      content.appendChild(catLabel)

      const catSelect = document.createElement("select")
      Object.assign(catSelect.style, {
        width: "100%",
        padding: "10px",
        border: "2px solid #e2e8f0",
        borderRadius: "8px",
        fontSize: "13px",
        marginBottom: "16px",
        boxSizing: "border-box"
      } as CSSStyleDeclaration)

      const categories = ["coding", "writing", "analysis", "creative", "other"]
      categories.forEach(cat => {
        const option = document.createElement("option")
        option.value = cat
        option.textContent = cat.charAt(0).toUpperCase() + cat.slice(1)
        if (cat === inferredCategory) {
          option.selected = true
        }
        catSelect.appendChild(option)
      })
      content.appendChild(catSelect)

      // Prompt preview
      const previewLabel = document.createElement("div")
      previewLabel.textContent = isChain ? `Conversation (${conversationChain.length} steps)` : "Prompt"
      Object.assign(previewLabel.style, {
        fontSize: "13px",
        fontWeight: "600",
        color: "#475569",
        marginBottom: "8px"
      })
      content.appendChild(previewLabel)

      const previewBox = document.createElement("div")
      if (isChain) {
        // Show chain preview
        let chainPreview = ""
        conversationChain.forEach((step, i) => {
          const promptPreview = step.prompt.length > 60 ? step.prompt.substring(0, 60) + "..." : step.prompt
          chainPreview += `${i + 1}. 👤 ${promptPreview}\n`
          if (step.response) {
            const respPreview = step.response.length > 60 ? step.response.substring(0, 60) + "..." : step.response
            chainPreview += `   🤖 ${respPreview}\n\n`
          }
        })
        previewBox.textContent = chainPreview
      } else {
        previewBox.textContent = lastScoreData?.rewrite || lastOriginalPrompt
      }

      Object.assign(previewBox.style, {
        background: "#f8fafc",
        border: "2px solid #e2e8f0",
        borderRadius: "8px",
        padding: "12px",
        fontSize: "12px",
        lineHeight: "1.5",
        color: "#475569",
        marginBottom: "16px",
        maxHeight: "200px",
        overflowY: "auto",
        whiteSpace: "pre-wrap"
      })
      content.appendChild(previewBox)

      // Buttons
      const btnRow = document.createElement("div")
      Object.assign(btnRow.style, {
        display: "flex",
        gap: "8px"
      })

      const cancelBtn = document.createElement("button")
      cancelBtn.textContent = "Cancel"
      Object.assign(cancelBtn.style, {
        flex: "1",
        padding: "12px",
        border: "2px solid #e2e8f0",
        borderRadius: "8px",
        background: "white",
        color: "#64748b",
        fontSize: "14px",
        fontWeight: "600",
        cursor: "pointer"
      } as CSSStyleDeclaration)
      cancelBtn.addEventListener("click", () => renderHistory())
      btnRow.appendChild(cancelBtn)

      const saveBtn = document.createElement("button")
      saveBtn.textContent = "Save"
      Object.assign(saveBtn.style, {
        flex: "1",
        padding: "10px",
        border: "none",
        borderRadius: "6px",
        background: "#3b82f6",
        color: "white",
        fontSize: "13px",
        fontWeight: "500",
        cursor: "pointer",
        transition: "all 0.15s"
      } as CSSStyleDeclaration)

      saveBtn.addEventListener("mouseenter", () => {
        saveBtn.style.background = "#2563eb"
      })
      saveBtn.addEventListener("mouseleave", () => {
        saveBtn.style.background = "#3b82f6"
      })

      saveBtn.addEventListener("click", () => {
        const title = titleInput.value.trim()
        if (!title) {
          toast("Please enter a title", false)
          return
        }

        const newTemplate: PromptTemplate = {
          id: Date.now().toString(),
          title,
          prompt: isChain ? conversationChain[0].prompt : (lastScoreData?.rewrite || lastOriginalPrompt),
          category: catSelect.value,
          score: lastScoreData?.revisedScore || lastScoreData?.score,
          timestamp: Date.now(),
          isFavorite: false,
          isChain,
          chainSteps: isChain ? conversationChain : undefined
        }

        promptHistory.push(newTemplate)
        chrome.storage.local.set({ promptHistory }, () => {
          toast(isChain ? "Conversation chain saved" : "Prompt saved")
          renderHistory()
        })
      })
      btnRow.appendChild(saveBtn)

      content.appendChild(btnRow)
    }
  )
}

function toggleFavorite(id: string) {
  const template = promptHistory.find(t => t.id === id)
  if (template) {
    template.isFavorite = !template.isFavorite
    chrome.storage.local.set({ promptHistory }, () => {
      renderHistory()
    })
  }
}

function deleteTemplate(id: string) {
  if (confirm("Delete this prompt?")) {
    promptHistory = promptHistory.filter(t => t.id !== id)
    chrome.storage.local.set({ promptHistory }, () => {
      toast("Prompt deleted")
      renderHistory()
    })
  }
}

function showExportDialog() {
  const content = document.getElementById("cwc-content")
  if (!content) return

  content.innerHTML = ""

  const header = document.createElement("div")
  header.innerHTML = `
    <div style="font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 6px;">Export Prompts</div>
    <div style="font-size: 13px; color: #6b7280; margin-bottom: 20px;">Choose what to export</div>
  `
  content.appendChild(header)

  // Export All button
  const exportAllBtn = document.createElement("button")
  exportAllBtn.textContent = "Export All Prompts"
  Object.assign(exportAllBtn.style, {
    width: "100%",
    padding: "12px",
    marginBottom: "12px",
    border: "none",
    borderRadius: "6px",
    background: "#3b82f6",
    color: "white",
    fontSize: "13px",
    fontWeight: "500",
    cursor: "pointer",
    transition: "all 0.15s"
  } as CSSStyleDeclaration)

  exportAllBtn.addEventListener("mouseenter", () => {
    exportAllBtn.style.background = "#2563eb"
  })
  exportAllBtn.addEventListener("mouseleave", () => {
    exportAllBtn.style.background = "#3b82f6"
  })

  exportAllBtn.addEventListener("click", () => {
    const dataStr = JSON.stringify({
      version: "1.0",
      exportDate: new Date().toISOString(),
      prompts: promptHistory
    }, null, 2)

    const blob = new Blob([dataStr], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `prompt-library-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)

    toast(`Exported ${promptHistory.length} prompts`)
  })
  content.appendChild(exportAllBtn)

  // Export Selected section
  const selectHeader = document.createElement("div")
  selectHeader.textContent = "Or select specific prompts to export:"
  Object.assign(selectHeader.style, {
    fontSize: "13px",
    fontWeight: "600",
    color: "#475569",
    marginTop: "20px",
    marginBottom: "12px"
  })
  content.appendChild(selectHeader)

  // Scrollable prompt list with checkboxes
  const promptList = document.createElement("div")
  Object.assign(promptList.style, {
    maxHeight: "300px",
    overflowY: "auto",
    marginBottom: "16px",
    border: "2px solid #e2e8f0",
    borderRadius: "8px",
    padding: "12px"
  })

  const selectedIds = new Set<string>()

  promptHistory.forEach(template => {
    const promptItem = document.createElement("div")
    Object.assign(promptItem.style, {
      display: "flex",
      alignItems: "center",
      padding: "8px",
      marginBottom: "8px",
      background: "#f8fafc",
      borderRadius: "6px",
      cursor: "pointer"
    })

    const checkbox = document.createElement("input")
    checkbox.type = "checkbox"
    checkbox.id = `export-${template.id}`
    Object.assign(checkbox.style, {
      marginRight: "10px",
      cursor: "pointer",
      width: "16px",
      height: "16px"
    })

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedIds.add(template.id)
      } else {
        selectedIds.delete(template.id)
      }
    })

    const label = document.createElement("label")
    label.htmlFor = `export-${template.id}`
    label.style.cursor = "pointer"
    label.style.flex = "1"
    label.innerHTML = `
      <div style="font-size: 13px; font-weight: 600; color: #1e293b;">${template.isChain ? "🔗 " : ""}${template.title}</div>
      <div style="font-size: 11px; color: #64748b;">${template.category}</div>
    `

    promptItem.appendChild(checkbox)
    promptItem.appendChild(label)
    promptList.appendChild(promptItem)
  })

  content.appendChild(promptList)

  // Export Selected button
  const exportSelectedBtn = document.createElement("button")
  exportSelectedBtn.textContent = "Export Selected"
  Object.assign(exportSelectedBtn.style, {
    width: "100%",
    padding: "12px",
    marginBottom: "12px",
    border: "1px solid #e5e7eb",
    borderRadius: "6px",
    background: "white",
    color: "#374151",
    fontSize: "13px",
    fontWeight: "500",
    cursor: "pointer",
    transition: "all 0.15s"
  } as CSSStyleDeclaration)

  exportSelectedBtn.addEventListener("mouseenter", () => {
    exportSelectedBtn.style.background = "#f9fafb"
  })
  exportSelectedBtn.addEventListener("mouseleave", () => {
    exportSelectedBtn.style.background = "white"
  })

  exportSelectedBtn.addEventListener("click", () => {
    if (selectedIds.size === 0) {
      toast("Please select at least one prompt", false)
      return
    }

    const selectedPrompts = promptHistory.filter(p => selectedIds.has(p.id))
    const dataStr = JSON.stringify({
      version: "1.0",
      exportDate: new Date().toISOString(),
      prompts: selectedPrompts
    }, null, 2)

    const blob = new Blob([dataStr], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `prompts-selected-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)

    toast(`Exported ${selectedIds.size} prompts`)
  })
  content.appendChild(exportSelectedBtn)

  // Back button
  const backBtn = document.createElement("button")
  backBtn.textContent = "← Back"
  Object.assign(backBtn.style, {
    width: "100%",
    padding: "12px",
    border: "2px solid #e2e8f0",
    borderRadius: "8px",
    background: "white",
    color: "#64748b",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer"
  } as CSSStyleDeclaration)
  backBtn.addEventListener("click", () => renderHistory())
  content.appendChild(backBtn)
}

function showImportDialog() {
  const content = document.getElementById("cwc-content")
  if (!content) return

  content.innerHTML = ""

  const header = document.createElement("div")
  header.innerHTML = `
    <div style="font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 6px;">Import Prompts</div>
    <div style="font-size: 13px; color: #6b7280; margin-bottom: 20px;">Upload a prompt library JSON file</div>
  `
  content.appendChild(header)

  // File input
  const fileInput = document.createElement("input")
  fileInput.type = "file"
  fileInput.accept = ".json"
  fileInput.style.display = "none"

  const uploadArea = document.createElement("div")
  Object.assign(uploadArea.style, {
    border: "2px dashed #667eea",
    borderRadius: "10px",
    padding: "40px",
    textAlign: "center",
    cursor: "pointer",
    background: "#f8fafc",
    marginBottom: "16px",
    transition: "all 0.2s"
  })
  uploadArea.innerHTML = `
    <div style="width: 48px; height: 48px; background: #f3f4f6; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; font-size: 20px; color: #6b7280;">↑</div>
    <div style="font-size: 14px; font-weight: 500; color: #111827; margin-bottom: 4px;">Click to upload JSON file</div>
    <div style="font-size: 12px; color: #6b7280;">Or drag and drop here</div>
  `

  uploadArea.addEventListener("click", () => fileInput.click())
  uploadArea.addEventListener("dragover", (e) => {
    e.preventDefault()
    uploadArea.style.background = "#e0f2fe"
    uploadArea.style.borderColor = "#3b82f6"
  })
  uploadArea.addEventListener("dragleave", () => {
    uploadArea.style.background = "#f8fafc"
    uploadArea.style.borderColor = "#667eea"
  })
  uploadArea.addEventListener("drop", (e) => {
    e.preventDefault()
    uploadArea.style.background = "#f8fafc"
    uploadArea.style.borderColor = "#667eea"

    const file = e.dataTransfer?.files[0]
    if (file) {
      handleImportFile(file)
    }
  })

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0]
    if (file) {
      handleImportFile(file)
    }
  })

  content.appendChild(fileInput)
  content.appendChild(uploadArea)

  // Info box
  const infoBox = document.createElement("div")
  Object.assign(infoBox.style, {
    background: "#eff6ff",
    border: "2px solid #bfdbfe",
    borderRadius: "8px",
    padding: "12px",
    marginBottom: "16px",
    fontSize: "12px",
    color: "#1e40af",
    lineHeight: "1.5"
  })
  infoBox.innerHTML = `
    <div style="font-weight: 600; margin-bottom: 4px;">ℹ️ Import Options:</div>
    <div>• Merge: Add imported prompts to your existing library</div>
    <div>• Replace: Replace your entire library with imported prompts</div>
    <div style="margin-top: 8px; color: #64748b;">Tip: Always export a backup before importing!</div>
  `
  content.appendChild(infoBox)

  // Back button
  const backBtn = document.createElement("button")
  backBtn.textContent = "← Back"
  Object.assign(backBtn.style, {
    width: "100%",
    padding: "12px",
    border: "2px solid #e2e8f0",
    borderRadius: "8px",
    background: "white",
    color: "#64748b",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer"
  } as CSSStyleDeclaration)
  backBtn.addEventListener("click", () => renderHistory())
  content.appendChild(backBtn)
}

function handleImportFile(file: File) {
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target?.result as string)

      if (!data.prompts || !Array.isArray(data.prompts)) {
        toast("Invalid file format", false)
        return
      }

      // Show merge/replace dialog
      showImportConfirmation(data.prompts)
    } catch (error) {
      toast("Error reading file", false)
      console.error(error)
    }
  }
  reader.readAsText(file)
}

function showImportConfirmation(importedPrompts: PromptTemplate[]) {
  const content = document.getElementById("cwc-content")
  if (!content) return

  content.innerHTML = ""

  const header = document.createElement("div")
  header.innerHTML = `
    <div style="font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 6px;">Confirm Import</div>
    <div style="font-size: 13px; color: #6b7280; margin-bottom: 20px;">Found ${importedPrompts.length} prompts. How would you like to import?</div>
  `
  content.appendChild(header)

  // Merge button
  const mergeBtn = document.createElement("button")
  mergeBtn.innerHTML = `
    <div style="font-size: 13px; font-weight: 500; margin-bottom: 4px;">Merge with Existing</div>
    <div style="font-size: 12px; opacity: 0.8;">Add ${importedPrompts.length} new prompts to your library</div>
  `
  Object.assign(mergeBtn.style, {
    width: "100%",
    padding: "14px",
    marginBottom: "12px",
    border: "none",
    borderRadius: "6px",
    background: "#10b981",
    color: "white",
    fontSize: "14px",
    fontWeight: "500",
    cursor: "pointer",
    textAlign: "left",
    transition: "all 0.15s"
  } as CSSStyleDeclaration)

  mergeBtn.addEventListener("mouseenter", () => {
    mergeBtn.style.background = "#059669"
  })
  mergeBtn.addEventListener("mouseleave", () => {
    mergeBtn.style.background = "#10b981"
  })

  mergeBtn.addEventListener("click", () => {
    promptHistory = [...promptHistory, ...importedPrompts]
    chrome.storage.local.set({ promptHistory }, () => {
      toast(`Imported ${importedPrompts.length} prompts`)
      renderHistory()
    })
  })
  content.appendChild(mergeBtn)

  // Replace button
  const replaceBtn = document.createElement("button")
  replaceBtn.innerHTML = `
    <div style="font-size: 13px; font-weight: 500; margin-bottom: 4px;">Replace Existing</div>
    <div style="font-size: 12px; opacity: 0.8;">Replace all ${promptHistory.length} current prompts with ${importedPrompts.length} imported ones</div>
  `
  Object.assign(replaceBtn.style, {
    width: "100%",
    padding: "14px",
    marginBottom: "12px",
    border: "1px solid #e5e7eb",
    borderRadius: "6px",
    background: "#f59e0b",
    color: "white",
    fontSize: "14px",
    fontWeight: "500",
    cursor: "pointer",
    textAlign: "left",
    transition: "all 0.15s"
  } as CSSStyleDeclaration)

  replaceBtn.addEventListener("mouseenter", () => {
    replaceBtn.style.background = "#d97706"
  })
  replaceBtn.addEventListener("mouseleave", () => {
    replaceBtn.style.background = "#f59e0b"
  })

  replaceBtn.addEventListener("click", () => {
    if (confirm(`Replace all ${promptHistory.length} existing prompts?`)) {
      promptHistory = importedPrompts
      chrome.storage.local.set({ promptHistory }, () => {
        toast(`Replaced with ${importedPrompts.length} prompts`)
        renderHistory()
      })
    }
  })
  content.appendChild(replaceBtn)

  // Cancel button
  const cancelBtn = document.createElement("button")
  cancelBtn.textContent = "Cancel"
  Object.assign(cancelBtn.style, {
    width: "100%",
    padding: "12px",
    border: "2px solid #e2e8f0",
    borderRadius: "8px",
    background: "white",
    color: "#64748b",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer"
  } as CSSStyleDeclaration)
  cancelBtn.addEventListener("click", () => renderHistory())
  content.appendChild(cancelBtn)
}

function renderSettings() {
  const content = document.getElementById("cwc-content")
  if (!content) return

  content.innerHTML = ""

  // Get saved API key
  chrome.storage.local.get(["anthropicApiKey"], (result) => {
    const savedKey = result.anthropicApiKey || ""

    // Settings header
    const header = document.createElement("div")
    Object.assign(header.style, {
      marginBottom: "24px"
    })
    header.innerHTML = `
      <div style="font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 6px;">API Settings</div>
      <div style="font-size: 13px; color: #6b7280; line-height: 1.5;">Configure your Anthropic API key for prompt optimization.</div>
    `
    content.appendChild(header)

    // API Key section
    const keySection = document.createElement("div")
    Object.assign(keySection.style, {
      marginBottom: "24px"
    })

    const keyLabel = document.createElement("label")
    keyLabel.textContent = "Anthropic API Key"
    Object.assign(keyLabel.style, {
      display: "block",
      fontSize: "13px",
      fontWeight: "600",
      color: "#475569",
      marginBottom: "8px"
    })

    const keyInput = document.createElement("input")
    keyInput.type = "password"
    keyInput.id = "cwc-api-key-input"
    keyInput.placeholder = "sk-ant-..."
    keyInput.value = savedKey
    Object.assign(keyInput.style, {
      width: "100%",
      padding: "12px",
      border: "2px solid #e2e8f0",
      borderRadius: "8px",
      fontSize: "13px",
      fontFamily: "monospace",
      boxSizing: "border-box",
      transition: "border-color 0.2s"
    } as CSSStyleDeclaration)

    keyInput.addEventListener("focus", () => {
      keyInput.style.borderColor = "#667eea"
      keyInput.style.outline = "none"
    })
    keyInput.addEventListener("blur", () => {
      keyInput.style.borderColor = "#e2e8f0"
    })

    keySection.appendChild(keyLabel)
    keySection.appendChild(keyInput)
    content.appendChild(keySection)

    // Info box
    const infoBox = document.createElement("div")
    Object.assign(infoBox.style, {
      background: "#eff6ff",
      border: "2px solid #bfdbfe",
      borderRadius: "8px",
      padding: "12px",
      marginBottom: "24px",
      fontSize: "12px",
      color: "#1e40af",
      lineHeight: "1.5"
    })
    infoBox.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 4px;">ℹ️ How to get your API key:</div>
      <div>1. Visit <a href="https://console.anthropic.com/" target="_blank" style="color: #2563eb; text-decoration: underline;">console.anthropic.com</a></div>
      <div>2. Go to API Keys section</div>
      <div>3. Create a new key and paste it above</div>
      <div style="margin-top: 8px; color: #64748b;">Your key is stored locally and only sent to the scorer server.</div>
    `
    content.appendChild(infoBox)

    // Save button
    const saveBtn = document.createElement("button")
    saveBtn.textContent = "Save Settings"
    saveBtn.id = "cwc-save-settings"
    Object.assign(saveBtn.style, {
      width: "100%",
      padding: "12px",
      border: "none",
      borderRadius: "6px",
      background: "#3b82f6",
      color: "white",
      fontSize: "13px",
      fontWeight: "500",
      cursor: "pointer",
      transition: "all 0.15s"
    } as CSSStyleDeclaration)

    saveBtn.addEventListener("mouseenter", () => {
      saveBtn.style.background = "#2563eb"
    })
    saveBtn.addEventListener("mouseleave", () => {
      saveBtn.style.background = "#3b82f6"
    })

    saveBtn.addEventListener("click", () => {
      const key = keyInput.value.trim()
      chrome.storage.local.set({ anthropicApiKey: key }, () => {
        toast("Settings saved", true)
        saveBtn.textContent = "Saved!"
        setTimeout(() => {
          saveBtn.textContent = "Save Settings"
        }, 2000)
      })
    })

    content.appendChild(saveBtn)
  })
}

function toggleSidebar(open?: boolean) {
  const sb = ensureSidebar()
  const next = typeof open === "boolean" ? open : sb.style.display === "none"
  sb.style.display = next ? "block" : "none"

  // Update Panel button text to match state
  const panelBtn = document.getElementById("cwc-embed-panel") as HTMLButtonElement | null
  if (panelBtn) {
    panelBtn.textContent = next ? "Close" : "Panel"
  }

  // Update sidebar content when opening
  if (next) {
    renderContent()
  }
}

function updateSidebarContent(originalPrompt: string, data: ScoreData) {
  const content = document.getElementById("cwc-content")
  if (!content) return

  content.innerHTML = ""

  const { score, rewrite, goal, revisedScore } = data

  // Score improvement card
  const scoreCard = document.createElement("div")
  Object.assign(scoreCard.style, {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    padding: "24px",
    marginBottom: "24px"
  })

  const finalScore = revisedScore !== undefined ? revisedScore : score
  const improvement = revisedScore !== undefined ? revisedScore - score : 0

  const scoreColor = finalScore >= 70 ? "#10b981" : finalScore >= 50 ? "#f59e0b" : "#6b7280"
  const scoreBg = finalScore >= 70 ? "#f0fdf4" : finalScore >= 50 ? "#fffbeb" : "#f9fafb"

  scoreCard.innerHTML = `
    <div style="text-align: center">
      <div style="font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px">Quality Score</div>
      <div style="display: inline-flex; align-items: baseline; background: ${scoreBg}; padding: 16px 24px; border-radius: 8px; margin-bottom: 12px">
        <span style="font-size: 48px; font-weight: 700; color: ${scoreColor};">${finalScore}</span>
        <span style="font-size: 20px; font-weight: 500; color: ${scoreColor}; margin-left: 4px">/100</span>
      </div>
      ${revisedScore !== undefined ? `
        <div style="font-size: 14px; font-weight: 500; color: ${improvement > 0 ? "#10b981" : "#6b7280"};">
          ${improvement > 0 ? `+${improvement} improvement` : "No change"}
        </div>
      ` : ""}
    </div>
  `
  content.appendChild(scoreCard)

  // Goal badge
  if (goal) {
    const goalBadge = document.createElement("div")
    Object.assign(goalBadge.style, {
      background: "#eff6ff",
      color: "#1e40af",
      padding: "8px 14px",
      borderRadius: "6px",
      fontSize: "12px",
      fontWeight: "500",
      marginBottom: "20px",
      display: "inline-block",
      border: "1px solid #bfdbfe"
    })
    goalBadge.textContent = goal
    content.appendChild(goalBadge)
    content.appendChild(document.createElement("br"))
  }

  // Original prompt section
  const origSection = createSection(
    `Original${score !== undefined ? ` • ${score}/100` : ""}`,
    originalPrompt,
    "#f9fafb",
    "#374151"
  )
  content.appendChild(origSection)

  // Revised prompt section
  const revSection = createSection(
    `Optimized${revisedScore !== undefined ? ` • ${revisedScore}/100` : ""}`,
    rewrite,
    "#f0fdf4",
    "#166534"
  )
  content.appendChild(revSection)

  // Copy button
  const copyBtn = document.createElement("button")
  copyBtn.textContent = "Copy to Clipboard"
  Object.assign(copyBtn.style, {
    width: "100%",
    padding: "12px",
    marginTop: "16px",
    border: "none",
    borderRadius: "6px",
    background: "#3b82f6",
    color: "white",
    fontSize: "13px",
    fontWeight: "500",
    cursor: "pointer",
    transition: "all 0.15s"
  })
  copyBtn.addEventListener("mouseenter", () => {
    copyBtn.style.background = "#2563eb"
  })
  copyBtn.addEventListener("mouseleave", () => {
    copyBtn.style.background = "#3b82f6"
  })
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(rewrite)
      copyBtn.textContent = "Copied!"
      setTimeout(() => (copyBtn.textContent = "Copy to Clipboard"), 2000)
    } catch {
      toast("Failed to copy", false)
    }
  })
  content.appendChild(copyBtn)
}

function createSection(title: string, text: string, bgColor: string, textColor: string): HTMLElement {
  const section = document.createElement("div")
  Object.assign(section.style, {
    marginBottom: "16px"
  })

  const header = document.createElement("div")
  header.textContent = title
  Object.assign(header.style, {
    fontSize: "12px",
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: "8px",
    textTransform: "uppercase",
    letterSpacing: "0.5px"
  })

  const box = document.createElement("div")
  box.textContent = text
  Object.assign(box.style, {
    background: bgColor,
    border: `1px solid ${bgColor === "#f0fdf4" ? "#d1fae5" : "#e5e7eb"}`,
    borderRadius: "6px",
    padding: "14px",
    fontSize: "13px",
    lineHeight: "1.6",
    color: textColor,
    whiteSpace: "pre-wrap",
    wordWrap: "break-word"
  })

  section.appendChild(header)
  section.appendChild(box)
  return section
}

// ---------------------------------------------------------------------
// Toast notifications
// ---------------------------------------------------------------------
function toast(msg: string, ok = true) {
  const id = "cwc-toast"
  document.getElementById(id)?.remove()
  const t = document.createElement("div")
  t.id = id
  t.textContent = msg
  Object.assign(t.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    padding: "12px 16px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "500",
    color: ok ? "#166534" : "#991b1b",
    background: ok ? "#f0fdf4" : "#fef2f2",
    border: ok ? "1px solid #bbf7d0" : "1px solid #fecaca",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    zIndex: "2147483647",
    animation: "cwc-slide-in 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
  } as CSSStyleDeclaration)

  if (!document.getElementById("cwc-toast-styles")) {
    const style = document.createElement("style")
    style.id = "cwc-toast-styles"
    style.textContent = `
      @keyframes cwc-slide-in {
        from { transform: translateY(100px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    `
    document.head.appendChild(style)
  }

  document.documentElement.appendChild(t)
  setTimeout(() => {
    t.style.opacity = "0"
    t.style.transform = "translateY(20px)"
    t.style.transition = "all 0.3s ease-out"
    setTimeout(() => t.remove(), 300)
  }, 2000)
}

// ---------------------------------------------------------------------
// Embedded toolbar buttons
// ---------------------------------------------------------------------
function makeIconButton(id: string, label: string, text: string) {
  const btn = document.createElement("button")
  btn.id = id
  btn.type = "button"
  btn.setAttribute("aria-label", label)
  btn.title = label
  btn.textContent = text
  Object.assign(btn.style, {
    height: "32px",
    padding: "0 12px",
    borderRadius: "6px",
    border: "1px solid #e5e7eb",
    background: "#ffffff",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "500",
    color: "#374151",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: "6px",
    transition: "all 0.15s",
    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
    flexShrink: "0"
  } as CSSStyleDeclaration)

  btn.addEventListener("mouseenter", () => {
    btn.style.background = "#f9fafb"
    btn.style.borderColor = "#d1d5db"
  })
  btn.addEventListener("mouseleave", () => {
    btn.style.background = "#ffffff"
    btn.style.borderColor = "#e5e7eb"
  })

  return btn
}

function findChatGPTToolbar(): HTMLElement | null {
  // Try multiple selectors for send button
  const selectors = [
    'form button[data-testid*="send"]',
    'form button[aria-label*="Send"]',
    'form button[type="submit"]',
    'button[data-testid="send-button"]',
    'form div[role="presentation"] button'
  ]

  let sendBtn: HTMLElement | null = null
  for (const sel of selectors) {
    sendBtn = document.querySelector(sel) as HTMLElement | null
    if (sendBtn) break
  }

  if (!sendBtn) {
    // Last resort: try to find form and use it directly
    const form = document.querySelector('form[class*="stretch"]') as HTMLElement | null
    return form
  }

  // Look for parent that has display flex
  let parent = sendBtn.parentElement
  while (parent) {
    const display = window.getComputedStyle(parent).display
    if (display === "flex" || display === "inline-flex") {
      return parent
    }
    // Don't go too far up
    if (parent.tagName === "FORM") break
    parent = parent.parentElement
  }

  // Fall back to direct parent
  return sendBtn.parentElement
}

function findClaudeToolbar(): HTMLElement | null {
  // Try multiple selectors for Claude's send button
  const selectors = [
    'button[aria-label="Send Message"]',
    'button[aria-label="Send"]',
    'form button[type="submit"]',
    'button[data-testid*="send"]',
    'fieldset button:last-of-type',
    'form div[role="presentation"] button',
    // More specific Claude selectors
    'div[class*="composer"] button',
    'div[class*="input"] button[type="submit"]'
  ]

  let sendBtn: HTMLElement | null = null
  for (const sel of selectors) {
    try {
      sendBtn = document.querySelector(sel) as HTMLElement | null
      if (sendBtn) {
        break
      }
    } catch (e) {
      // Silently continue
    }
  }

  if (!sendBtn) {
    // Try to find the fieldset directly - Claude often uses this
    const fieldset = document.querySelector('fieldset') as HTMLElement | null
    if (fieldset) {
      // Look for a flex container within fieldset
      const flexDiv = fieldset.querySelector('div[style*="flex"]') as HTMLElement | null
      if (flexDiv) return flexDiv
      return fieldset
    }
    // Last resort: try form
    const form = document.querySelector('form') as HTMLElement | null
    return form
  }

  // Look for parent that has display flex
  let parent = sendBtn.parentElement
  while (parent) {
    const display = window.getComputedStyle(parent).display
    if (display === "flex" || display === "inline-flex") {
      return parent
    }
    if (parent.tagName === "FORM" || parent.tagName === "FIELDSET") break
    parent = parent.parentElement
  }

  // Fall back to direct parent
  return sendBtn.parentElement
}

function ensureEmbeddedButtons() {
  const improveId = "cwc-embed-improve"
  const panelId = "cwc-embed-panel"
  const nextId = "cwc-embed-next"

  // If all buttons already exist AND are still in the DOM, skip
  const existing = document.getElementById(improveId)
  if (existing && existing.parentElement &&
      document.getElementById(panelId) &&
      document.getElementById(nextId)) {
    return
  }

  const container =
    SITE === "chatgpt"
      ? findChatGPTToolbar()
      : SITE === "claude"
        ? findClaudeToolbar()
        : null

  if (!container) {
    console.log("[CWC] Toolbar container not found, will retry on next mutation")
    return
  }

  let improve = document.getElementById(improveId) as HTMLButtonElement | null
  if (!improve) {
    improve = makeIconButton(improveId, "Improve Prompt", "Optimize")
    container.appendChild(improve)
    improve.addEventListener("click", handleImproveClick)
  }

  let next = document.getElementById(nextId) as HTMLButtonElement | null
  if (!next) {
    next = makeIconButton(nextId, "Suggest Next Prompt", "AutoPrompt")
    next.disabled = !hasConversation
    next.style.opacity = hasConversation ? "1" : "0.5"
    next.style.cursor = hasConversation ? "pointer" : "not-allowed"
    container.appendChild(next)
    next.addEventListener("click", handleNextClick)
  }

  let panel = document.getElementById(panelId) as HTMLButtonElement | null
  if (!panel) {
    panel = makeIconButton(panelId, "Open Panel", "Panel")
    container.appendChild(panel)
    panel.addEventListener("click", () => {
      toggleSidebar()
      const open = ensureSidebar().style.display !== "none"
      panel!.textContent = open ? "Close" : "Panel"
    })
  }
}

// ---------------------------------------------------------------------
// Chain Replay
// ---------------------------------------------------------------------
function replayChain(steps: Array<{ prompt: string; response?: string }>) {
  let currentStep = 0

  function sendNextPrompt() {
    if (currentStep >= steps.length) {
      toast("Chain replay complete")
      return
    }

    const composer = getComposer()
    if (!composer) {
      toast("Composer not found", false)
      return
    }

    // Set the prompt
    setText(composer, steps[currentStep].prompt)
    toast(`Step ${currentStep + 1}/${steps.length}: Prompt inserted`)

    // Auto-submit (find and click send button)
    setTimeout(() => {
      const sendBtn = findSendButton()
      if (sendBtn) {
        sendBtn.click()
        console.log(`[CWC] Auto-sent prompt ${currentStep + 1}`)

        // Wait for AI response before next prompt
        currentStep++
        if (currentStep < steps.length) {
          // Wait for response to complete, then send next
          waitForResponse(() => {
            console.log(`[CWC] Response ${currentStep} complete, sending next...`)
            toast(`Step ${currentStep}/${steps.length} complete`)
            sendNextPrompt()
          })
        } else {
          toast("Chain replay complete")
        }
      } else {
        console.log("[CWC] Send button not found, manual submission required")
        toast(`Please submit manually, then we'll continue`, false)
      }
    }, 500)
  }

  // Start the chain
  sendNextPrompt()
}

function waitForResponse(callback: () => void) {
  let checkCount = 0
  const maxChecks = 120 // 2 minutes max wait (120 * 1 second)

  function checkIfResponseComplete() {
    checkCount++

    if (checkCount > maxChecks) {
      console.log("[CWC] Response timeout, proceeding anyway")
      toast("Timeout waiting for response, continuing", false)
      callback()
      return
    }

    // Check if AI is still generating
    const isGenerating = detectIfGenerating()

    if (isGenerating) {
      // Still generating, check again in 1 second
      setTimeout(checkIfResponseComplete, 1000)
    } else {
      // Response complete! Wait a bit for UI to settle, then proceed
      setTimeout(callback, 1500)
    }
  }

  // Start checking after initial delay
  setTimeout(checkIfResponseComplete, 2000)
}

function detectIfGenerating(): boolean {
  if (SITE === "chatgpt") {
    // ChatGPT: Check for stop button or streaming indicator
    const stopBtn = document.querySelector('button[aria-label*="Stop"]')
    if (stopBtn) return true

    // Check for streaming messages
    const messages = document.querySelectorAll('[data-message-author-role="assistant"]')
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1]
      // If last message has cursor or is marked as streaming, still generating
      const hasCursor = lastMsg.querySelector('.result-streaming')
      if (hasCursor) return true
    }

    return false
  } else if (SITE === "claude") {
    // Claude: Check for streaming attribute
    const streamingElements = document.querySelectorAll('[data-is-streaming="true"]')
    if (streamingElements.length > 0) return true

    // Check for stop button
    const stopBtn = document.querySelector('button[aria-label*="Stop"]')
    if (stopBtn) return true

    return false
  }

  return false
}

function findSendButton(): HTMLElement | null {
  if (SITE === "chatgpt") {
    const btn = document.querySelector('form button[data-testid*="send"], form button[aria-label*="Send"]') as HTMLElement
    return btn
  } else if (SITE === "claude") {
    const btn = document.querySelector('button[aria-label="Send Message"], button[aria-label="Send"]') as HTMLElement
    return btn
  }
  return null
}

// ---------------------------------------------------------------------
// Conversation Chain Extraction
// ---------------------------------------------------------------------
function extractConversationChain(): Array<{ prompt: string; response?: string }> {
  const chain: Array<{ prompt: string; response?: string }> = []

  if (SITE === "chatgpt") {
    // ChatGPT: Alternate between user and assistant messages
    const allMessages = document.querySelectorAll('[data-message-author-role]')
    let currentPrompt = ""

    allMessages.forEach(msg => {
      const role = msg.getAttribute('data-message-author-role')
      const text = (msg.textContent || "").trim()

      if (role === "user" && text) {
        currentPrompt = text
      } else if (role === "assistant" && text && currentPrompt) {
        chain.push({ prompt: currentPrompt, response: text })
        currentPrompt = ""
      }
    })

    // Add last prompt if no response yet
    if (currentPrompt) {
      chain.push({ prompt: currentPrompt })
    }
  } else if (SITE === "claude") {
    // Claude: Extract conversation pairs
    const userMessages = document.querySelectorAll('[data-is-streaming="false"]')
    const messages: Array<{ role: string; text: string }> = []

    // Collect all messages
    userMessages.forEach(msg => {
      const text = (msg.textContent || "").trim()
      if (text) {
        // Try to determine role from context
        const parent = msg.closest('[class*="user"], [class*="assistant"], [class*="Human"], [class*="Assistant"]')
        const isUser = parent?.className.toLowerCase().includes('user') || parent?.className.toLowerCase().includes('human')
        messages.push({ role: isUser ? 'user' : 'assistant', text })
      }
    })

    // Pair up messages
    let currentPrompt = ""
    messages.forEach(({ role, text }) => {
      if (role === 'user') {
        currentPrompt = text
      } else if (currentPrompt) {
        chain.push({ prompt: currentPrompt, response: text })
        currentPrompt = ""
      }
    })

    if (currentPrompt) {
      chain.push({ prompt: currentPrompt })
    }
  }

  return chain
}

// ---------------------------------------------------------------------
// AI Response Detection
// ---------------------------------------------------------------------
function detectAIResponse() {
  // Try to find the last AI response message
  let responseText = ""

  if (SITE === "chatgpt") {
    // ChatGPT: Find assistant messages
    const messages = document.querySelectorAll('[data-message-author-role="assistant"]')
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1]
      responseText = lastMsg.textContent || ""
    }
  } else if (SITE === "claude") {
    // Claude: Find response divs
    const responses = document.querySelectorAll('[data-is-streaming="false"]')
    if (responses.length > 0) {
      const lastResp = responses[responses.length - 1]
      responseText = lastResp.textContent || ""
    }
  }

  if (responseText && responseText.length > 20) {
    lastAIResponse = responseText.trim()
    if (!hasConversation) {
      hasConversation = true
      updateNextButton(true)
    }
  }
}

function updateNextButton(enabled: boolean) {
  const btn = document.getElementById("cwc-embed-next") as HTMLButtonElement | null
  if (btn) {
    btn.disabled = !enabled
    btn.style.opacity = enabled ? "1" : "0.4"
    btn.style.cursor = enabled ? "pointer" : "not-allowed"
  }
}

// ---------------------------------------------------------------------
// Next Prompt Flow
// ---------------------------------------------------------------------
function handleNextClick() {
  if (!hasConversation || !lastAIResponse) {
    toast("Have a conversation first!", false)
    return
  }

  const btn = document.getElementById("cwc-embed-next") as HTMLButtonElement | null
  const prev = btn?.textContent
  if (btn) {
    btn.textContent = "⏳"
    btn.disabled = true
  }

  chrome.runtime.sendMessage(
    {
      type: "suggestNext",
      lastPrompt: lastOriginalPrompt,
      lastResponse: lastAIResponse.substring(0, 2000) // Limit response length
    },
    (reply: any) => {
      if (btn) {
        btn.textContent = prev || "AutoPrompt"
        btn.disabled = false
      }

      if (!reply?.ok) {
        toast("Error generating next prompt", false)
        console.error("[CWC] Next prompt error:", reply)
        return
      }

      console.log("[CWC] Next prompt reply:", reply)
      suggestedNextPrompts = reply.data.suggestions || []
      console.log("[CWC] Suggestions array:", suggestedNextPrompts)

      if (suggestedNextPrompts.length === 0) {
        toast("No suggestions received", false)
        return
      }

      currentTab = "results"
      toggleSidebar(true)
      renderSuggestion()
      toast("Next prompts suggested")
    }
  )
}

// ---------------------------------------------------------------------
// Improve flow
// ---------------------------------------------------------------------
function handleImproveClick() {
  const composer = getComposer()
  if (!composer) {
    toast("Editor not found on this page", false)
    return
  }
  const current = getText(composer).trim()
  if (!current) {
    toast("Type something first, then click ✨", false)
    return
  }

  lastOriginalPrompt = current

  const btn = document.getElementById(
    "cwc-embed-improve"
  ) as HTMLButtonElement | null
  const prev = btn?.textContent
  if (btn) {
    btn.textContent = "⏳"
    btn.disabled = true
  }

  chrome.runtime.sendMessage(
    { type: "scorePrompt", text: current },
    (reply: ScoreReply) => {
      if (!reply?.ok) {
        if (btn) {
          btn.textContent = prev || "✨"
          btn.disabled = false
        }
        toast("Error contacting scorer", false)
        return
      }
      const { rewrite, score, goal } = reply.data

      // Now score the revised prompt to show improvement
      chrome.runtime.sendMessage(
        { type: "scorePrompt", text: rewrite },
        (revisedReply: ScoreReply) => {
          if (btn) {
            btn.textContent = prev || "✨"
            btn.disabled = false
          }

          let revisedScore = score // default to original if revised scoring fails
          if (revisedReply?.ok) {
            revisedScore = revisedReply.data.score
          }

          const dataWithRevised = {
            ...reply.data,
            revisedScore
          }

          lastScoreData = dataWithRevised

          setText(composer, rewrite)
          const improvement = revisedScore - score
          toast(
            `Optimized: ${score} → ${revisedScore} ${improvement > 0 ? `(+${improvement})` : ""}`
          )

          // Update sidebar if open
          const open = ensureSidebar().style.display !== "none"
          if (open) {
            updateSidebarContent(lastOriginalPrompt, dataWithRevised)
          }
        }
      )
    }
  )
}

// ---------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------
function attach() {
  ensureEmbeddedButtons()
  detectAIResponse()
}

;(function main() {
  console.log("[CWC] Embedded buttons loaded:", SITE, location.href)
  attach()
  const obs = new MutationObserver(() => attach())
  obs.observe(document.documentElement, { subtree: true, childList: true })

  // Watch for URL changes (SPA navigation like "New Chat")
  let lastUrl = location.href
  const checkUrlChange = () => {
    const currentUrl = location.href
    if (currentUrl !== lastUrl) {
      console.log("[CWC] URL changed, re-attaching buttons:", currentUrl)
      lastUrl = currentUrl
      // Small delay to let the page render
      setTimeout(() => attach(), 100)
    }
  }

  // Listen for popstate (back/forward) and patch history methods
  window.addEventListener("popstate", checkUrlChange)
  const originalPushState = history.pushState
  const originalReplaceState = history.replaceState
  history.pushState = function (...args) {
    originalPushState.apply(this, args)
    checkUrlChange()
  }
  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args)
    checkUrlChange()
  }
})()

export default function ContentScript() {
  return null
}
