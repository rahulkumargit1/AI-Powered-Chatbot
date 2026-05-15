const state = {
  conversations: [],
  activeId: null,
  activeConvo: null,
  streaming: false,
};

const $ = (id) => document.getElementById(id);

const el = {
  list: $("conversation-list"),
  messages: $("messages"),
  title: $("chat-title"),
  subtitle: $("chat-subtitle"),
  newChat: $("new-chat-btn"),
  composer: $("composer"),
  input: $("composer-input"),
  send: $("send-btn"),
  errorBanner: $("error-banner"),
  settingsBtn: $("settings-btn"),
  modal: $("settings-modal"),
  systemPrompt: $("system-prompt-input"),
  cancelSettings: $("settings-cancel"),
  saveSettings: $("settings-save"),
};

if (window.marked) {
  window.marked.setOptions({ breaks: true, gfm: true });
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try { const j = await res.json(); detail = j.detail || detail; } catch (_) {}
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

function showError(msg) {
  el.errorBanner.textContent = msg;
  el.errorBanner.classList.remove("hidden");
}

function clearError() { el.errorBanner.classList.add("hidden"); }

function relativeTime(iso) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

async function loadConversations() {
  try {
    state.conversations = await api("/api/conversations");
    renderList();
  } catch (e) {
    showError(`Failed to load conversations: ${e.message}`);
  }
}

function renderList() {
  el.list.innerHTML = "";
  if (state.conversations.length === 0) {
    const empty = document.createElement("li");
    empty.style.cssText = "color:var(--muted);cursor:default;justify-content:center;font-size:12px;";
    empty.innerHTML = '<span class="convo-title">No conversations yet</span>';
    el.list.appendChild(empty);
    return;
  }
  for (const c of state.conversations) {
    const li = document.createElement("li");
    if (c.id === state.activeId) li.classList.add("active");
    li.dataset.id = c.id;

    const titleSpan = document.createElement("span");
    titleSpan.className = "convo-title";
    titleSpan.textContent = c.title;
    li.appendChild(titleSpan);

    const del = document.createElement("button");
    del.className = "delete-btn";
    del.title = "Delete";
    del.textContent = "✕";
    del.addEventListener("click", (e) => { e.stopPropagation(); deleteConversation(c.id); });
    li.appendChild(del);

    li.addEventListener("click", () => selectConversation(c.id));
    el.list.appendChild(li);
  }
}

function setHeader(title, subtitle) {
  el.title.textContent = title;
  if (el.subtitle) el.subtitle.textContent = subtitle;
}

async function selectConversation(id) {
  if (state.streaming) return;
  state.activeId = id;
  try {
    state.activeConvo = await api(`/api/conversations/${id}`);
    const count = state.activeConvo.messages.length;
    setHeader(
      state.activeConvo.title,
      count === 0 ? "No messages yet" : `${count} message${count === 1 ? "" : "s"} · ${relativeTime(state.activeConvo.updated_at)}`,
    );
    el.input.disabled = false;
    el.send.disabled = false;
    el.input.focus();
    renderMessages();
    renderList();
    clearError();
  } catch (e) {
    showError(`Failed to load conversation: ${e.message}`);
  }
}

function renderMessages() {
  el.messages.innerHTML = "";
  if (!state.activeConvo || state.activeConvo.messages.length === 0) {
    renderWelcome();
    return;
  }
  for (const m of state.activeConvo.messages) appendMessage(m.role, m.content);
  scrollToBottom();
}

const SUGGESTIONS = [
  { icon: "📡", title: "Explain SSE", sub: "in two paragraphs", prompt: "Explain how Server-Sent Events work in two short paragraphs." },
  { icon: "🐍", title: "Fibonacci in Python", sub: "with memoization", prompt: "Write a Python function that returns the nth Fibonacci number using memoization." },
  { icon: "💡", title: "Climate-tech ideas", sub: "three startups", prompt: "Give me three creative startup ideas in the climate-tech space." },
  { icon: "🗄️", title: "SQL vs NoSQL", sub: "at a glance", prompt: "Summarise the key differences between SQL and NoSQL databases." },
];

function renderWelcome() {
  const wrap = document.createElement("div");
  wrap.className = "welcome-screen";
  wrap.innerHTML = `
    <div class="welcome-orb"></div>
    <h1 class="welcome-title">${state.activeConvo ? "Start the conversation" : "Welcome to Claude Chat"}</h1>
    <p class="welcome-sub">Powered by Anthropic <code>claude-sonnet-4-6</code> · streaming responses</p>
    <div class="suggestion-grid">
      ${SUGGESTIONS.map(s => `
        <button class="suggestion" data-prompt="${s.prompt.replace(/"/g, "&quot;")}">
          <div class="suggestion-icon">${s.icon}</div>
          <div class="suggestion-title">${s.title}</div>
          <div class="suggestion-sub">${s.sub}</div>
        </button>`).join("")}
    </div>`;
  el.messages.appendChild(wrap);
  wireSuggestions();
}

function wireSuggestions() {
  document.querySelectorAll(".suggestion").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const prompt = btn.dataset.prompt;
      if (!prompt || state.streaming) return;
      if (!state.activeId) await createConversation();
      el.input.value = "";
      sendMessage(prompt);
    });
  });
}

function renderMarkdown(bubble, content) {
  if (!content) { bubble.innerHTML = ""; return; }
  if (window.marked) {
    bubble.innerHTML = window.marked.parse(content);
    if (window.hljs) {
      bubble.querySelectorAll("pre code").forEach((c) => {
        if (!c.dataset.highlighted) window.hljs.highlightElement(c);
      });
    }
  } else {
    bubble.textContent = content;
  }
}

function appendMessage(role, content) {
  const welcome = el.messages.querySelector(".welcome-screen");
  if (welcome) welcome.remove();

  const row = document.createElement("div");
  row.className = `message-row ${role}`;

  const avatar = document.createElement("div");
  avatar.className = `msg-avatar ${role}`;
  avatar.textContent = role === "user" ? "U" : "C";
  row.appendChild(avatar);

  const bubble = document.createElement("div");
  bubble.className = `message ${role}`;
  if (role === "assistant") renderMarkdown(bubble, content);
  else bubble.textContent = content;

  row.appendChild(bubble);
  el.messages.appendChild(row);
  return bubble;
}

function scrollToBottom() { el.messages.scrollTop = el.messages.scrollHeight; }

async function createConversation() {
  try {
    const convo = await api("/api/conversations", { method: "POST", body: "{}" });
    state.conversations.unshift({ id: convo.id, title: convo.title, updated_at: convo.updated_at });
    state.activeId = convo.id;
    state.activeConvo = convo;
    setHeader(convo.title, "No messages yet");
    el.input.disabled = false;
    el.send.disabled = false;
    el.input.focus();
    renderList();
    renderMessages();
    clearError();
  } catch (e) {
    showError(`Failed to create chat: ${e.message}`);
  }
}

async function deleteConversation(id) {
  if (state.streaming) return;
  if (!confirm("Delete this conversation?")) return;
  try {
    await api(`/api/conversations/${id}`, { method: "DELETE" });
    state.conversations = state.conversations.filter((c) => c.id !== id);
    if (state.activeId === id) {
      state.activeId = null;
      state.activeConvo = null;
      setHeader("New conversation", "Start chatting with Claude");
      el.input.disabled = true;
      el.send.disabled = true;
      el.messages.innerHTML = "";
      renderWelcome();
    }
    renderList();
  } catch (e) {
    showError(`Delete failed: ${e.message}`);
  }
}

async function sendMessage(text) {
  if (!state.activeId) await createConversation();
  if (!state.activeId || state.streaming) return;

  state.streaming = true;
  el.input.disabled = true;
  el.send.disabled = true;
  clearError();

  appendMessage("user", text);
  scrollToBottom();

  const assistantBubble = appendMessage("assistant", "");
  assistantBubble.classList.add("streaming");
  let accumulated = "";
  scrollToBottom();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: state.activeId, message: text }),
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        accumulated = handleSSEBlock(block, assistantBubble, accumulated);
      }
    }
  } catch (e) {
    showError(`Stream error: ${e.message}`);
    accumulated += `\n\n*Error: ${e.message}*`;
  } finally {
    assistantBubble.classList.remove("streaming");
    renderMarkdown(assistantBubble, accumulated);
    scrollToBottom();
    state.streaming = false;
    el.input.disabled = false;
    el.send.disabled = false;
    el.input.focus();
  }
}

function handleSSEBlock(block, bubble, accumulated) {
  let event = "message";
  let data = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return accumulated;
  let parsed;
  try { parsed = JSON.parse(data); } catch { return accumulated; }

  if (event === "error") { showError(parsed.message || "Unknown error"); return accumulated; }
  if (event === "title" && parsed.title) {
    const idx = state.conversations.findIndex((c) => c.id === state.activeId);
    if (idx !== -1) {
      state.conversations[idx].title = parsed.title;
      setHeader(parsed.title, el.subtitle ? el.subtitle.textContent : "");
      renderList();
    }
    return accumulated;
  }
  if (event === "done") return accumulated;
  if (parsed.text) {
    accumulated += parsed.text;
    renderMarkdown(bubble, accumulated);
    scrollToBottom();
  }
  return accumulated;
}

el.composer.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = el.input.value.trim();
  if (!text || state.streaming) return;
  el.input.value = "";
  el.input.style.height = "auto";
  sendMessage(text);
});

el.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); el.composer.requestSubmit(); }
});

el.input.addEventListener("input", () => {
  el.input.style.height = "auto";
  el.input.style.height = Math.min(el.input.scrollHeight, 200) + "px";
});

el.newChat.addEventListener("click", createConversation);

el.settingsBtn.addEventListener("click", () => {
  if (!state.activeConvo) return;
  el.systemPrompt.value = state.activeConvo.system_prompt || "";
  el.modal.classList.remove("hidden");
});

el.cancelSettings.addEventListener("click", () => el.modal.classList.add("hidden"));

el.saveSettings.addEventListener("click", async () => {
  if (!state.activeId) return;
  try {
    const updated = await api(`/api/conversations/${state.activeId}`, {
      method: "PATCH",
      body: JSON.stringify({ system_prompt: el.systemPrompt.value }),
    });
    state.activeConvo.system_prompt = updated.system_prompt;
    el.modal.classList.add("hidden");
  } catch (e) {
    showError(`Save failed: ${e.message}`);
  }
});

el.modal.addEventListener("click", (e) => { if (e.target === el.modal) el.modal.classList.add("hidden"); });

// Boot — enable composer so suggestion cards work before any convo is selected
el.input.disabled = false;
el.send.disabled = false;
wireSuggestions();
loadConversations();
