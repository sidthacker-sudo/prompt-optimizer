// Background service worker for Context-Weaving Copilot
// Handles state management and communication between popup and content scripts

chrome.runtime.onInstalled.addListener(() => {
  console.log("Context-Weaving Copilot extension installed")
  // Initialize default state
  chrome.storage.local.set({ isActive: true })
  updateBadge(true)
})

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "ping") {
    sendResponse({ status: "ready" })
  } else if (request.type === "getState") {
    chrome.storage.local.get(["isActive"], (result) => {
      sendResponse({ isActive: result.isActive ?? true })
    })
    return true // Keep channel open for async response
  } else if (request.type === "setState") {
    chrome.storage.local.set({ isActive: request.isActive }, () => {
      updateBadge(request.isActive)
      // Notify all content scripts of state change
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          chrome.tabs.sendMessage(tab.id, {
            type: "stateChanged",
            isActive: request.isActive
          }).catch(() => {
            // Ignore errors for tabs without content script
          })
        })
      })
      sendResponse({ success: true })
    })
    return true // Keep channel open for async response
  } else if (request.type === "captureContext") {
    // Handle context capture from sidebar
    const timestamp = new Date().toISOString()
    chrome.storage.local.get(["contexts"], (result) => {
      const contexts = result.contexts || []
      contexts.push({
        id: Date.now(),
        timestamp,
        url: sender.tab?.url,
        data: request.data
      })
      chrome.storage.local.set({ contexts }, () => {
        sendResponse({ success: true, contextId: contexts.length - 1 })
      })
    })
    return true
  } else if (request.type === "scorePrompt") {
    // Call the FastAPI scorer on Railway
    const { text } = request

    // Get API key from storage
    chrome.storage.local.get(["anthropicApiKey"], (result) => {
      const apiKey = result.anthropicApiKey || ""
      console.log("CWC: Sending request to Railway server...")

      fetch("https://web-production-80cf2.up.railway.app/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, api_key: apiKey })
      })
        .then((res) => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`)
          }
          return res.json()
        })
        .then((data) => {
          sendResponse({ ok: true, data })
        })
        .catch((err) => {
          sendResponse({ ok: false, error: err.message })
        })
    })
    return true // Keep channel open for async fetch
  } else if (request.type === "suggestNext") {
    // Suggest next prompt based on conversation
    const { lastPrompt, lastResponse } = request

    chrome.storage.local.get(["anthropicApiKey"], (result) => {
      const apiKey = result.anthropicApiKey || ""

      fetch("https://web-production-80cf2.up.railway.app/suggest-next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ last_prompt: lastPrompt, last_response: lastResponse, api_key: apiKey })
      })
        .then((res) => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`)
          }
          return res.json()
        })
        .then((data) => {
          sendResponse({ ok: true, data })
        })
        .catch((err) => {
          sendResponse({ ok: false, error: err.message })
        })
    })
    return true
  } else if (request.type === "inferMetadata") {
    // Infer title and category for a prompt
    const { prompt } = request

    chrome.storage.local.get(["anthropicApiKey"], (result) => {
      const apiKey = result.anthropicApiKey || ""

      fetch("https://web-production-80cf2.up.railway.app/infer-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, api_key: apiKey })
      })
        .then((res) => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`)
          }
          return res.json()
        })
        .then((data) => {
          sendResponse({ ok: true, data })
        })
        .catch((err) => {
          sendResponse({ ok: false, error: err.message })
        })
    })
    return true
  }
  return false
})

// Update extension badge based on state
function updateBadge(isActive) {
  if (isActive) {
    chrome.action.setBadgeText({ text: "✓" })
    chrome.action.setBadgeBackgroundColor({ color: "#10b981" })
  } else {
    chrome.action.setBadgeText({ text: "" })
  }
}
