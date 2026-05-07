console.log("PolicyScope content script loaded");

const blocks = getTextBlocks();
const detectedClauses = detectClauses(blocks);

// ── DEBUG: check for duplicate sentences ──────────────────────
const _textCounts = {};
detectedClauses.forEach(c => {
  _textCounts[c.text] = (_textCounts[c.text] || 0) + 1;
});
const _dupes = Object.entries(_textCounts).filter(([t, c]) => c > 1);
console.log("PolicyScope: Total clauses detected:", detectedClauses.length);
console.log("PolicyScope: Duplicate sentences:", _dupes.length);
_dupes.forEach(([text, count]) =>
  console.log(`  ${count}x:`, text.substring(0, 100))
);
// ─────────────────────────────────────────────────────────────

console.log("Detected Clauses:", detectedClauses);

function toggleHighlights() {
  updateHighlightVisibility(!window.highlightsVisible);
}

highlightClauses(detectedClauses).then(() => {
  // After highlighting, log how many actually got a highlight element
  const highlighted = detectedClauses.filter(c => c.highlightElement).length;
  const missed = detectedClauses.filter(c => !c.highlightElement).length;
  console.log("PolicyScope: Successfully highlighted:", highlighted);
  console.log("PolicyScope: Failed to highlight:", missed);
  detectedClauses
    .filter(c => !c.highlightElement)
    .forEach(c =>
      console.log("  MISSED:", c.type, "|", c.text.substring(0, 80))
    );
});

createPolicyScopeBadge(detectedClauses.length);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getDetections") {
    sendResponse({
      data: detectedClauses.map(({ type, bigCategory, text }) => ({
        type,
        bigCategory,
        text
      }))
    });
    return;
  }

  if (request.action === "scrollToClause") {
    const match = detectedClauses.find(c => c.text === request.text);

    if (match?.highlightElement) {
      match.highlightElement.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    } else if (match?.node?.parentElement) {
      match.node.parentElement.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    } else {
      // Last resort: search the page for the text and scroll to it
      const found = findTextNodeForSentence(match.text);
      if (found?.parentElement) {
        found.parentElement.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
      }
    }

    return;
  }

  if (request.action === "analyzeClause") {
    chrome.runtime.sendMessage(
      { action: "analyzeClause", text: request.text },
      response => { sendResponse(response); }
    );
    return true;
  }

  if (request.action === "toggleHighlight") {
    toggleHighlights();
    return;
  }

  if (request.action === "refreshHighlightColors") {
    refreshHighlightColors().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (request.action === "refreshHighlightStyle") {
    refreshHighlightStyle().then(() => sendResponse({ ok: true }));
    return true;
  }
});

// Helper: fresh DOM walk to find a text node containing a sentence
// Used as fallback when stored node reference is stale or already split
function findTextNodeForSentence(sentence) {
  if (!sentence) return null;
  const trimmed = sentence.trim();
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(escaped);

  const ignored = ["SCRIPT","STYLE","NOSCRIPT","NAV","FOOTER","HEADER","BUTTON"];

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node.parentNode) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (ignored.includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (pattern.test(node.textContent)) return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_REJECT;
      }
    }
  );

  return walker.nextNode() || null;
}
